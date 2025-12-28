const express = require('express')
const compression = require('compression')
const path = require('path')
const { Pool } = require('pg')
const {
  parseAuctionTitle,
  normalize,
  canonicalNumberText,
  looksLikeLotOrSealed
} = require('./server/enrichment/titleParser')

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

let hasCheckedSalesTable = false
let salesTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasCheckedSalesCardColumn = false
let salesCardColumnAvailable = false
let hasCheckedSalesParsedSetCodeColumn = false
let salesParsedSetCodeColumnAvailable = false
let hasBackfilledSalesCards = false
let hasEnsuredSalesCardIndex = false

async function ensureColumnExists(tableName, columnName, definition) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  )

  if (rows.length > 0) return true

  try {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
    return true
  } catch (error) {
    console.error(`Failed to add ${columnName} column to ${tableName}`, error)
    return false
  }
}

async function ensureUniqueConstraint(tableName, constraintName, definition) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM pg_constraint
      WHERE conname = $1
        AND conrelid = $2::regclass
    `,
    [constraintName, tableName]
  )

  if (rows.length > 0) return true

  try {
    await pool.query(`ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} UNIQUE ${definition}`)
    return true
  } catch (error) {
    console.error(`Failed to add ${constraintName} constraint to ${tableName}`, error)
    return false
  }
}

async function ensureIndexExists(tableName, indexName, definition) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
        AND indexname = $2
    `,
    [tableName, indexName]
  )

  if (rows.length > 0) return true

  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} ${definition}`)
    return true
  } catch (error) {
    console.error(`Failed to create ${indexName} on ${tableName}`, error)
    return false
  }
}

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
        set_code TEXT,
        set_total INTEGER,
        card_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cards_unique_name_set UNIQUE (name, set_name)
      )
    `)

    const setCodeColumnReady = await ensureColumnExists('cards', 'set_code', 'TEXT')
    const setTotalColumnReady = await ensureColumnExists('cards', 'set_total', 'INTEGER')

    const hasSetCodeCardNumberUnique = await ensureUniqueConstraint(
      'public.cards',
      'cards_unique_set_code_number',
      '(set_code, card_number)'
    )

    cardsTableAvailable = setCodeColumnReady && setTotalColumnReady && hasSetCodeCardNumberUnique
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

async function ensureSalesParsedSetCodeColumnAvailable() {
  if (!pool) return false
  if (hasCheckedSalesParsedSetCodeColumn) return salesParsedSetCodeColumnAvailable

  if (!salesTableAvailable) return false

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tradera_sales' AND column_name = 'parsed_set_code'`
  )

  if (rows.length > 0) {
    salesParsedSetCodeColumnAvailable = true
    hasCheckedSalesParsedSetCodeColumn = true
    return true
  }

  try {
    await pool.query('ALTER TABLE tradera_sales ADD COLUMN parsed_set_code TEXT')
    salesParsedSetCodeColumnAvailable = true
  } catch (error) {
    console.error('Failed to add parsed_set_code column to tradera_sales', error)
    salesParsedSetCodeColumnAvailable = false
  }

  hasCheckedSalesParsedSetCodeColumn = true
  return salesParsedSetCodeColumnAvailable
}

async function ensureSalesCardIndexAvailable() {
  if (!pool || hasEnsuredSalesCardIndex) return hasEnsuredSalesCardIndex

  const salesAvailable = await ensureSalesTableAvailable()
  if (!salesAvailable) return false

  const indexReady = await ensureIndexExists(
    'tradera_sales',
    'idx_tradera_sales_card_id_end_date',
    '(card_id, end_date DESC)'
  )

  hasEnsuredSalesCardIndex = indexReady
  return indexReady
}

async function ensureCardInfrastructure() {
  const salesAvailable = await ensureSalesTableAvailable()
  const cardsAvailable = await ensureCardsTableAvailable()
  if (!salesAvailable || !cardsAvailable) return false

  const cardColumnAvailable = await ensureSalesCardColumnAvailable()
  const parsedSetCodeAvailable = await ensureSalesParsedSetCodeColumnAvailable()
  const cardIndexAvailable = await ensureSalesCardIndexAvailable()
  return cardColumnAvailable && parsedSetCodeAvailable && cardIndexAvailable
}

async function findOrCreateCardBySetCodeAndNumber(
  db,
  { setCode = null, numberText = null, cardNo = null, totalInSet = null, cardName = null, setGuess = null }
) {
  const normalizedSetCode = setCode?.trim() || null
  const cardNumber = canonicalNumberText(numberText, cardNo ?? null, totalInSet ?? null)

  if (!normalizedSetCode || !cardNumber) return null

  const existing = await db.query(
    `SELECT id FROM public.cards WHERE set_code = $1 AND card_number = $2 LIMIT 1`,
    [normalizedSetCode, cardNumber]
  )
  if (existing.rows[0]) return existing.rows[0].id

  const inserted = await db.query(
    `
    INSERT INTO public.cards (name, set_name, card_number, set_code, set_total)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [cardName ?? 'unknown', setGuess ?? 'unknown', cardNumber, normalizedSetCode, totalInSet ?? null]
  )

  return inserted.rows[0].id
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
      c.set_code AS card_set_code,
      c.card_number AS card_number,
      ts.attributes->'pokemon_era'->>0 AS pokemon_era,
      ts.attributes->'pokemon_language'->>0 AS pokemon_language,
      ts.attributes->'pokemon_grading_issuer'->>0 AS grading_issuer,
      ts.attributes->'pokemon_grade'->>0 AS grading_grade
    FROM tradera_sales ts
    LEFT JOIN cards c ON c.id = ts.card_id
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
    cardSetCode: row.card_set_code || null,
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

async function fetchCard(cardId) {
  if (!pool) return null

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return null
  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return null

  const cardQuery = `
    SELECT id, name, era, set_name AS set_name, set_code, set_total, card_number, created_at
    FROM cards
    WHERE id = $1
  `

  const cardResult = await pool.query(cardQuery, [cardId])
  if (cardResult.rows.length === 0) return null

  return cardResult.rows[0]
}

async function fetchCardsList({ setCode = null } = {}) {
  if (!pool) return []

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return []

  const whereClause = setCode ? 'WHERE c.set_code = $1 OR c.set_name = $1' : ''
  const params = setCode ? [setCode] : []

  const cardsQuery = `
    SELECT
      c.id,
      c.name,
      c.era,
      c.set_name AS set_name,
      c.set_code,
      c.set_total,
      c.card_number,
      c.created_at,
      COUNT(ts.item_id)::int AS auction_count,
      MAX(ts.end_date) AS last_sale_at
    FROM cards c
    LEFT JOIN tradera_sales ts ON ts.card_id = c.id
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.set_code NULLS LAST, c.set_name, c.card_number
  `

  const cardsResult = await pool.query(cardsQuery, params)
  return cardsResult.rows
}

async function fetchExpansionSummaries() {
  if (!pool) return []

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return []

  const expansionsQuery = `
    SELECT
      c.set_code,
      c.set_name,
      c.era,
      c.set_total,
      COUNT(DISTINCT c.id)::int AS card_count,
      COUNT(ts.item_id)::int AS auction_count
    FROM cards c
    LEFT JOIN tradera_sales ts ON ts.card_id = c.id
    GROUP BY c.set_code, c.set_name, c.era, c.set_total
    ORDER BY c.set_name
  `

  const result = await pool.query(expansionsQuery)
  return result.rows
}

async function fetchCardAuctions(cardId, { limit = 500 } = {}) {
  if (!pool) return []

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) return []
  const tableExists = await ensureSalesTableAvailable()
  const cardsExist = await ensureCardsTableAvailable()
  if (!tableExists || !cardsExist) return []

  const auctionsQuery = `
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
      c.set_code AS card_set_code,
      c.card_number AS card_number
    FROM tradera_sales ts
    JOIN cards c ON c.id = ts.card_id
    WHERE ts.card_id = $1
    ORDER BY ts.end_date DESC
    LIMIT $2
  `

  const auctionsResult = await pool.query(auctionsQuery, [cardId, limit])
  return auctionsResult.rows.map(normalizeAuctionRow)
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

app.get('/api/expansions', async (_req, res) => {
  try {
    const expansions = await fetchExpansionSummaries()
    return res.json(expansions)
  } catch (error) {
    console.error('Failed to fetch expansions', error)
    return res.status(500).json({ error: 'Failed to load expansions' })
  }
})

app.get('/api/cards', async (req, res) => {
  try {
    const setCode = typeof req.query.set === 'string' ? req.query.set : null
    const cards = await fetchCardsList({ setCode })
    return res.json(cards)
  } catch (error) {
    console.error('Failed to fetch cards', error)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

app.get('/api/cards/:id', async (req, res) => {
  try {
    const cardId = Number(req.params.id)
    if (Number.isNaN(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' })
    }

    const card = await fetchCard(cardId)
    if (!card) {
      return res.status(404).json({ error: 'Card not found' })
    }

    return res.json(card)
  } catch (error) {
    console.error('Failed to fetch card', error)
    return res.status(500).json({ error: 'Failed to load card' })
  }
})

app.get('/api/cards/:id/auctions', async (req, res) => {
  try {
    const cardId = Number(req.params.id)
    if (Number.isNaN(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' })
    }

    const auctions = await fetchCardAuctions(cardId, { limit: 500 })
    return res.json(auctions)
  } catch (error) {
    console.error('Failed to fetch card auctions', error)
    return res.status(500).json({ error: 'Failed to load card auctions' })
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

app.post('/api/enrichment/run', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  const infrastructureReady = await ensureCardInfrastructure()
  if (!infrastructureReady) {
    return res.status(500).json({ ok: false, error: 'Card infrastructure unavailable' })
  }

  const client = await pool.connect()
  try {
    const limit = Number(req.body?.limit ?? 500)

    const { rows } = await client.query(
      `
      SELECT item_id, title, card_id
      FROM public.tradera_sales
      WHERE end_date >= NOW() - INTERVAL '60 days'
      ORDER BY end_date DESC
      LIMIT $1
      `,
      [limit],
    )

    let linked = 0
    let needsReview = 0
    let unmatched = 0

    for (const row of rows) {
      const parsed = parseAuctionTitle(row.title ?? '')
      const titleNorm = normalize(row.title ?? '')
      const status = parsed.enrich_status ?? 'unmatched'
      const confidence = parsed.enrich_confidence ?? null

      await client.query(
        `
        UPDATE public.tradera_sales
        SET
          parsed_card_name = $2,
          parsed_number_text = $3,
          parsed_card_no = $4,
          parsed_total_in_set = $5,
          parsed_set_guess = $6,
          parsed_set_confidence = $7,
          parsed_set_code = $8,
          enrich_status = $9,
          enrich_confidence = $10,
          enrich_notes = $11
        WHERE item_id = $1
        `,
        [
          row.item_id,
          parsed.parsed_card_name ?? null,
          parsed.parsed_number_text ?? null,
          parsed.parsed_card_no ?? null,
          parsed.parsed_total_in_set ?? null,
          parsed.parsed_set_guess ?? null,
          parsed.parsed_set_confidence ?? null,
          parsed.setCode ?? null,
          status,
          confidence,
          JSON.stringify({ source: 'title', title: row.title })
        ],
      )

      if (row.card_id != null) {
        continue
      }

      if (looksLikeLotOrSealed(titleNorm)) {
        await client.query(
          `
          UPDATE public.tradera_sales
          SET enrich_status = 'needs_review',
              enrich_confidence = LEAST(COALESCE(enrich_confidence, 0), 20),
              enrich_notes = COALESCE(enrich_notes, '{}'::jsonb) || jsonb_build_object('skip', 'lot_or_sealed')
          WHERE item_id = $1
          `,
          [row.item_id],
        )
        needsReview++
        continue
      }

      const cardId = await findOrCreateCardBySetCodeAndNumber(client, {
        setCode: parsed.setCode,
        numberText: parsed.parsed_number_text,
        cardNo: parsed.parsed_card_no,
        totalInSet: parsed.parsed_total_in_set,
        cardName: parsed.parsed_card_name,
        setGuess: parsed.parsed_set_guess
      })

      if (cardId) {
        await client.query(
          `
          UPDATE public.tradera_sales
          SET card_id = $2,
              enrich_status = 'linked',
              enrich_confidence = GREATEST(COALESCE(enrich_confidence, 0), 80)
          WHERE item_id = $1
            AND card_id IS NULL
          `,
          [row.item_id, cardId],
        )
        linked++
      } else {
        await client.query(
          `
          UPDATE public.tradera_sales
          SET enrich_status = CASE
              WHEN parsed_card_name IS NOT NULL THEN 'needs_review'
              ELSE 'unmatched'
            END,
            enrich_confidence = COALESCE(enrich_confidence, 0)
          WHERE item_id = $1
          `,
          [row.item_id],
        )

        if (parsed.parsed_card_name) needsReview++
        else unmatched++
      }
    }

    res.json({
      processed: rows.length,
      linked,
      needsReview,
      unmatched
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: String(e) })
  } finally {
    client.release()
  }
})

app.get('/api/enrichment/summary', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE card_id IS NOT NULL)::int AS linked,
          COUNT(*) FILTER (WHERE enrich_status = 'needs_review')::int AS needs_review,
          COUNT(*) FILTER (WHERE card_id IS NULL)::int AS unlinked
        FROM public.tradera_sales
      `)

    res.json({
      available: true,
      totalAuctions: rows[0].total,
      linkedAuctions: rows[0].linked,
      unlinkedAuctions: rows[0].unlinked,
      needsReview: rows[0].needs_review
    })
  } catch (e) {
    res.status(500).json({ available: false, error: String(e) })
  }
})

app.get('/api/enrichment/unmatched', async (req, res) => {
  const limit = Number(req.query.limit ?? 25)
  const { rows } = await pool.query(
    `
      SELECT item_id, end_date, title, parsed_set_guess, parsed_number_text, enrich_status, enrich_confidence
      FROM public.tradera_sales
      WHERE card_id IS NULL
      ORDER BY end_date DESC
      LIMIT $1
      `,
    [limit]
  )
  res.json(rows)
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
