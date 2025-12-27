const express = require('express')
const compression = require('compression')
const path = require('path')
const { Pool } = require('pg')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

app.use(compression())
app.use(express.json())

const MAX_RESULTS = Number(process.env.MAX_API_RESULTS || 250)
const DATABASE_URL = process.env.DATABASE_URL
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// --------------------
// Database
// --------------------
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : undefined
    })
  : null

let hasCheckedSalesTable = false
let salesTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasBackfilledSalesCards = false

async function ensureSalesTableAvailable() {
  if (!pool) return false
  if (hasCheckedSalesTable) return salesTableAvailable

  const { rows } = await pool.query(
    "SELECT to_regclass('public.tradera_sales') AS table_name"
  )

  salesTableAvailable = Boolean(rows?.[0]?.table_name)
  hasCheckedSalesTable = true

  if (!salesTableAvailable) {
    console.warn('tradera_sales table does not exist')
  }

  return salesTableAvailable
}

async function ensureCardsTableAvailable() {
  if (!pool) return false
  if (hasCheckedCardsTable) return cardsTableAvailable

  const { rows } = await pool.query("SELECT to_regclass('public.cards') AS table_name")

  cardsTableAvailable = Boolean(rows?.[0]?.table_name)
  hasCheckedCardsTable = true

  if (!cardsTableAvailable) {
    console.warn('cards table does not exist')
  }

  return cardsTableAvailable
}

function normalizeCardValue(value) {
  if (!value) return 'unknown'
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ') || 'unknown'
}

function extractCardPayload(row) {
  const attributes = row.attributes || {}
  const attributeValue = (key) => {
    const value = attributes?.[key]
    if (!value) return null
    if (Array.isArray(value)) return value[0]
    return value
  }

  const rawName = attributeValue('Card name') || row.title || 'Unknown card'
  const rawSet = attributeValue('Series') || attributeValue('Set')

  return {
    name: normalizeCardValue(rawName),
    era: attributeValue('Era') || attributeValue('Generation'),
    set_name: rawSet ? normalizeCardValue(rawSet) : 'unknown',
    card_number: attributeValue('Card number')
  }
}

async function ensureMissingSalesAreLinkedToCards() {
  if (!pool || hasBackfilledSalesCards) return

  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return

  const { rows: missingRows } = await pool.query(
    `SELECT item_id, title, attributes FROM tradera_sales WHERE card_id IS NULL LIMIT 5000`
  )

  if (missingRows.length === 0) {
    hasBackfilledSalesCards = true
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cardCache = new Map()

    for (const row of missingRows) {
      const payload = extractCardPayload(row)
      const cacheKey = `${payload.name}::${payload.set_name}`

      if (!cardCache.has(cacheKey)) {
        const cardResult = await client.query(
          `
            INSERT INTO cards (name, era, set_name, card_number)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (name, set_name) DO UPDATE SET
              era = COALESCE(cards.era, EXCLUDED.era),
              card_number = COALESCE(cards.card_number, EXCLUDED.card_number)
            RETURNING id
          `,
          [payload.name, payload.era, payload.set_name, payload.card_number]
        )

        cardCache.set(cacheKey, cardResult.rows[0].id)
      }

      const cardId = cardCache.get(cacheKey)
      await client.query('UPDATE tradera_sales SET card_id = $1 WHERE item_id = $2', [
        cardId,
        row.item_id
      ])
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Failed to backfill card links', error)
  } finally {
    client.release()
  }
}

async function fetchAuctionsFromDatabase() {
  if (!pool) return []

  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return []

  await ensureMissingSalesAreLinkedToCards()

  const query = `
    SELECT
      item_id,
      title,
      price,
      bid_count,
      end_date,
      seller_alias,
      seller_dsr,
      item_url,
      thumbnail_url,
      attributes,
      fetched_at,
      card_id,
      c.name AS card_name,
      c.era AS card_era,
      c.set_name AS card_set_name,
      c.card_number AS card_number
    FROM tradera_sales ts
    JOIN cards c ON c.id = ts.card_id
    ORDER BY ts.end_date DESC
    LIMIT $1
  `

  const { rows } = await pool.query(query, [MAX_RESULTS])
  return rows.map(normalizeAuctionRow)
}

function normalizeAuctionRow(row) {
  const attributes = row.attributes || {}

  const attributeValue = (key, fallback) => {
    const value = attributes?.[key]
    if (!value) return fallback
    if (Array.isArray(value)) return value[0]
    return value
  }

  return {
    id: `T-${row.item_id}`,
    cardId: row.card_id,
    title: row.title || 'Untitled listing',
    cardName: row.card_name || attributeValue('Card name', row.title || 'Unknown card'),
    cardEra: row.card_era || 'Unknown era',
    cardSetName: row.card_set_name || attributeValue('Series', 'Unknown set'),
    cardNumber: row.card_number || attributeValue('Card number', null),
    seller: row.seller_alias || 'Unknown seller',
    sellerType:
      typeof row.seller_dsr === 'number' && row.seller_dsr >= 4.7
        ? 'trusted'
        : 'new',
    finalPrice: row.price ?? 0,
    currency: 'SEK',
    bids: row.bid_count ?? 0,
    endTime: row.end_date,
    condition: attributeValue('Condition', 'Unknown'),
    category: attributeValue('Series', 'Pokémon cards'),
    location: attributeValue('Location', 'Tradera'),
    url: row.item_url || '',
    addedAt: row.fetched_at || row.end_date,
    thumbnail: row.thumbnail_url || null
  }
}

async function fetchCardWithAuctions(cardId) {
  if (!pool) return null

  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return null

  const cardQuery = `
    SELECT id, name, era, set_name AS set_name, card_number, created_at
    FROM cards
    WHERE id = $1
  `

  const cardResult = await pool.query(cardQuery, [cardId])
  if (cardResult.rows.length === 0) return null

  const card = cardResult.rows[0]

  const auctionsQuery = `
    SELECT
      item_id,
      title,
      price,
      bid_count,
      end_date,
      seller_alias,
      seller_dsr,
      item_url,
      thumbnail_url,
      attributes,
      fetched_at,
      ts.card_id,
      c.name AS card_name,
      c.era AS card_era,
      c.set_name AS card_set_name,
      c.card_number AS card_number
    FROM tradera_sales ts
    JOIN cards c ON c.id = ts.card_id
    WHERE ts.card_id = $1
    ORDER BY ts.end_date DESC
  `

  const auctionsResult = await pool.query(auctionsQuery, [cardId])
  const auctions = auctionsResult.rows.map(normalizeAuctionRow)

  return {
    card,
    auctions
  }
}

// --------------------
// API
// --------------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: IS_PRODUCTION ? 'production' : 'development',
    dbConfigured: Boolean(DATABASE_URL)
  })
})

app.get('/api/sales', async (_req, res) => {
  try {
    const auctions = await fetchAuctionsFromDatabase()
    return res.json(auctions) // may be []
  } catch (error) {
    console.error('Failed to fetch auctions', error)
    return res.status(500).json({ error: 'Failed to load auctions' })
  }
})

app.get('/api/cards/:id', async (req, res) => {
  try {
    const cardId = Number(req.params.id)
    if (Number.isNaN(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' })
    }

    const result = await fetchCardWithAuctions(cardId)
    if (!result) {
      return res.status(404).json({ error: 'Card not found' })
    }

    return res.json(result)
  } catch (error) {
    console.error('Failed to fetch card', error)
    return res.status(500).json({ error: 'Failed to load card' })
  }
})

app.get('/api/sales/diagnostic', async (_req, res) => {
  try {
    const auctions = await fetchAuctionsFromDatabase()
    res.json({
      source: 'database',
      count: auctions.length,
      auctions
    })
  } catch (error) {
    res.status(500).json({
      source: 'database',
      error: error.message
    })
  }
})

// --------------------
// Frontend
// --------------------

app.use(express.static(distPath))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
