const express = require('express')
const compression = require('compression')
const path = require('path')
const { Pool } = require('pg')
const { normalize, extractNumber, titleToCardNameGuess } = require('./server/titleParser')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

app.use(compression())
app.use(express.json())

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

const SET_ALIASES = [
  { set_name: 'Fusion Strike', aliases: ['fusion strike', 'fusionstrike'] }
  // add more later
]

function findSetGuess(normTitle) {
  let best = null
  let bestLen = 0
  for (const s of SET_ALIASES) {
    for (const a of s.aliases) {
      const na = normalize(a)
      if (na && normTitle.includes(na) && na.length > bestLen) {
        best = { set_name: s.set_name, aliasHit: na }
        bestLen = na.length
      }
    }
  }
  return best
}

let hasCheckedSalesTable = false
let salesTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasCheckedSalesCardColumn = false
let salesCardColumnAvailable = false
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

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        era TEXT,
        set_name TEXT NOT NULL,
        card_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cards_unique_name_set UNIQUE (name, set_name)
      )
    `)

    cardsTableAvailable = true
  } catch (error) {
    console.error('Failed to ensure cards table exists', error)
    cardsTableAvailable = false
  }

  hasCheckedCardsTable = true
  return cardsTableAvailable
}

async function ensureSalesCardColumnAvailable() {
  if (!pool) return false
  if (hasCheckedSalesCardColumn) return salesCardColumnAvailable

  if (!salesTableAvailable) return false

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tradera_sales' AND column_name = 'card_id'`
  )

  if (rows.length > 0) {
    salesCardColumnAvailable = true
    hasCheckedSalesCardColumn = true
    return true
  }

  try {
    await pool.query('ALTER TABLE tradera_sales ADD COLUMN card_id INTEGER REFERENCES cards(id)')
    salesCardColumnAvailable = true
  } catch (error) {
    console.error('Failed to add card_id column to tradera_sales', error)
    salesCardColumnAvailable = false
  }

  hasCheckedSalesCardColumn = true
  return salesCardColumnAvailable
}

async function ensureCardInfrastructure() {
  const salesAvailable = await ensureSalesTableAvailable()
  const cardsAvailable = await ensureCardsTableAvailable()
  if (!salesAvailable || !cardsAvailable) return false

  const cardColumnAvailable = await ensureSalesCardColumnAvailable()
  return cardColumnAvailable
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

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return
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

async function fetchAuctionsFromDatabase(filters = {}) {
  if (!pool) return []

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return []
  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return []

  await ensureMissingSalesAreLinkedToCards()

  const {
    era = null,
    language = null,
    gradingIssuer = null,
    grade = null,
    minPrice = null,
    maxPrice = null,
    limit = null,
    offset = 0
  } = filters

  const query = `
    SELECT
      ts.item_id,
      ts.title,
      ts.price,
      ts.bid_count,
      ts.end_date,
      ts.seller_alias,
      ts.seller_dsr,
      ts.item_url,
      ts.thumbnail_url,
      ts.attributes,
      ts.fetched_at,
      ts.card_id,
      c.name AS card_name,
      c.era AS card_era,
      c.set_name AS card_set_name,
      c.card_number AS card_number,
      ts.attributes->'pokemon_era'->>0 AS pokemon_era,
      ts.attributes->'pokemon_language'->>0 AS pokemon_language,
      ts.attributes->'pokemon_grading_issuer'->>0 AS grading_issuer,
      ts.attributes->'pokemon_grade'->>0 AS grading_grade
    FROM tradera_sales ts
    JOIN cards c ON c.id = ts.card_id
    WHERE
      ($1::text IS NULL OR ts.attributes->'pokemon_era' ? $1)
      AND ($2::text IS NULL OR ts.attributes->'pokemon_language' ? $2)
      AND ($3::text IS NULL OR ts.attributes->'pokemon_grading_issuer' ? $3)
      AND ($4::text IS NULL OR ts.attributes->'pokemon_grade' ? $4)
      AND ($5::int IS NULL OR ts.price >= $5)
      AND ($6::int IS NULL OR ts.price <= $6)
    ORDER BY ts.end_date DESC
  `

  const params = [era, language, gradingIssuer, grade, minPrice, maxPrice]

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.push(limit)
    query += ` LIMIT $${params.length}`

    if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
      params.push(offset)
      query += ` OFFSET $${params.length}`
    }
  }

  const { rows } = await pool.query(query, params)
  return rows.map(normalizeAuctionRow)
}

function normalizeAuctionRow(row) {
  const attributes = row.attributes || {}

  const normalizedAttributes = Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [String(key).toLowerCase(), value])
  )

  const attributeValue = (key, fallback) => {
    const value = attributes?.[key] ?? normalizedAttributes[key?.toLowerCase?.()]
    if (!value) return fallback
    if (Array.isArray(value)) return value[0]
    return value
  }

  const language =
    row.pokemon_language ||
    attributeValue('pokemon_language') ||
    attributeValue('Language') ||
    attributeValue('Språk') ||
    attributeValue('Sprak') ||
    null

  const gradingCompany =
    row.grading_issuer ||
    attributeValue('pokemon_grading_issuer') ||
    attributeValue('Graded by') ||
    attributeValue('Grading company') ||
    null

  const grade =
    row.grading_grade ||
    attributeValue('pokemon_grade') ||
    attributeValue('Grade') ||
    attributeValue('Condition grade') ||
    null

  return {
    id: `T-${row.item_id}`,
    cardId: row.card_id,
    title: row.title || 'Untitled listing',
    cardName: row.card_name || attributeValue('Card name', row.title || 'Unknown card'),
    cardEra:
      row.card_era ||
      row.pokemon_era ||
      attributeValue('pokemon_era') ||
      attributeValue('Era', 'Unknown era'),
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
    thumbnail: row.thumbnail_url || null,
    language: language || 'Unknown language',
    gradingCompany: gradingCompany || 'Ungraded',
    grade: gradingCompany ? grade || 'Not graded' : 'Not graded',
    rawAttributes: attributes
  }
}

async function fetchEnrichmentSummary() {
  if (!pool) return { available: false }

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return { available: false }

  const tableExists = await ensureSalesTableAvailable()
  if (!tableExists) return { available: false }

  const [{ rows: auctionRows }, { rows: cardRows }, { rows: freshnessRows }] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS total_auctions,
          COUNT(card_id)::int AS linked_auctions,
          COUNT(*) FILTER (WHERE card_id IS NULL)::int AS unlinked_auctions
        FROM tradera_sales
      `
    ),
    pool.query('SELECT COUNT(*)::int AS total_cards FROM cards'),
    pool.query('SELECT MAX(fetched_at) AS last_fetched_at, MAX(end_date) AS last_end_at FROM tradera_sales')
  ])

  return {
    available: true,
    totalAuctions: auctionRows?.[0]?.total_auctions ?? 0,
    linkedAuctions: auctionRows?.[0]?.linked_auctions ?? 0,
    unlinkedAuctions: auctionRows?.[0]?.unlinked_auctions ?? 0,
    distinctCards: cardRows?.[0]?.total_cards ?? 0,
    lastFetchedAt: freshnessRows?.[0]?.last_fetched_at ?? null,
    lastEndAt: freshnessRows?.[0]?.last_end_at ?? null
  }
}

async function fetchCardWithAuctions(cardId) {
  if (!pool) return null

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return null
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

app.get('/api/sales', async (req, res) => {
  try {
    const parsedLimit = req.query.limit ? Number(req.query.limit) : null
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : null
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0

    const auctions = await fetchAuctionsFromDatabase({
      era: req.query.era || null,
      language: req.query.language || null,
      gradingIssuer: req.query.gradingIssuer || null,
      grade: req.query.grade || null,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : null,
      limit,
      offset
    })
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

app.get('/api/enrichment/summary', async (_req, res) => {
  try {
    const summary = await fetchEnrichmentSummary()
    res.json(summary)
  } catch (error) {
    console.error('Failed to fetch enrichment summary', error)
    res.status(500).json({ error: 'Failed to load enrichment summary' })
  }
})

app.post('/api/enrichment/run', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

    const limit = Number(req.body?.limit ?? 300)
    const threshold = Number(req.body?.threshold ?? 80)

    const auctions = await pool.query(
      `
      SELECT item_id, title, card_id
      FROM public.tradera_sales
      WHERE (enrich_status IS NULL OR enrich_status IN ('unmatched','needs_review'))
      ORDER BY end_date DESC
      LIMIT $1
      `,
      [limit]
    )

    let linked = 0
    let needsReview = 0
    let unmatched = 0

    for (const a of auctions.rows) {
      const rawTitle = a.title || ''
      const norm = normalize(rawTitle)

      const { numberText, cardNo, total } = extractNumber(norm)
      const setGuess = findSetGuess(norm)

      const cardNameGuess = titleToCardNameGuess(
        numberText ? norm.replace(numberText, ' ') : norm,
        setGuess?.aliasHit
      )

      let status = 'unmatched'
      let confidence = 0
      let matchedCardId = null
      const notes = { rawTitle, normTitle: norm, numberText, cardNo, total, setGuess, cardNameGuess }

      if (setGuess?.set_name && numberText) {
        const match = await pool.query(
          `
          SELECT id, name, set_name, card_number
          FROM public.cards
          WHERE set_name = $1 AND card_number = $2
          LIMIT 2
          `,
          [setGuess.set_name, numberText]
        )

        if (match.rows.length === 1) {
          matchedCardId = match.rows[0].id
          confidence = 95
          status = confidence >= threshold ? 'linked' : 'needs_review'
        } else if (match.rows.length > 1) {
          status = 'needs_review'
          confidence = 60
          notes.reason = 'multiple_cards_same_set_number'
        }
      }

      if (!matchedCardId && setGuess?.set_name && cardNameGuess) {
        const match = await pool.query(
          `
          SELECT id
          FROM public.cards
          WHERE set_name = $1 AND LOWER(name) = $2
          LIMIT 2
          `,
          [setGuess.set_name, normalize(cardNameGuess)]
        )

        if (match.rows.length === 1) {
          matchedCardId = match.rows[0].id
          confidence = 80
          status = confidence >= threshold ? 'linked' : 'needs_review'
        } else if (match.rows.length > 1) {
          status = 'needs_review'
          confidence = 55
          notes.reason = 'multiple_cards_same_set_name'
        }
      }

      if (status === 'linked' && matchedCardId) linked += 1
      else if (status === 'needs_review') needsReview += 1
      else unmatched += 1

      await pool.query(
        `
        UPDATE public.tradera_sales
        SET
          parsed_card_name = $2,
          parsed_number_text = $3,
          parsed_card_no = $4,
          parsed_total_in_set = $5,
          parsed_set_guess = $6,
          parsed_set_confidence = $7,
          enrich_status = $8,
          enrich_confidence = $9,
          enrich_notes = $10,
          card_id = CASE WHEN $8 = 'linked' THEN $11 ELSE card_id END
        WHERE item_id = $1
        `,
        [
          a.item_id,
          cardNameGuess,
          numberText,
          cardNo,
          total,
          setGuess?.set_name ?? null,
          setGuess ? 90 : 0,
          status,
          confidence,
          JSON.stringify(notes),
          matchedCardId
        ]
      )
    }

    res.json({ ok: true, attempted: auctions.rows.length, linked, needsReview, unmatched })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: String(error) })
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
