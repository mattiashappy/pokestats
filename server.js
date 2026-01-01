// server.js
const express = require('express')
const compression = require('compression')
const path = require('path')
const { spawn } = require('child_process')
const { Pool } = require('pg')
const crypto = require('crypto')

const { loadCatalog } = require('./server/catalog/catalogLoader')
const { seedCatalog } = require('./server/catalog/catalogSeeder')

const {
  parseAuctionTitle,
  normalize,
  canonicalNumberText,
  looksLikeLotOrSealed
} = require('./server/enrichment/titleParser')
const {
  resolveAuctionMatch,
  normalizeEraLabel,
  parseCardNumber,
  parseSetHint,
  parseCardName
} = require('./server/enrichment/numberFirstMatcher')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

app.use(compression())
app.use(express.json())

const DATABASE_URL = process.env.DATABASE_URL
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const CARD_METADATA_OVERRIDES = new Map([
  [
    22888,
    {
      image_url: 'https://images.pokemontcg.io/base1/1_hires.png',
      product_details: `Product Details
Card Number / Rarity:001/102 / Holo Rare
Card Type / HP / Stage:Psychic / 80 / Stage 2
Card Text:Pokémon Power: Damage Swap As often as you like during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon to another as long as you don't Knock Out that Pokémon. This power can't be used if Alakazam is Asleep, Confused, or Paralyzed.
Attack 1:[PPP] Confuse Ray (30)
Flip a coin. If heads, the Defending Pokémon is now Confused.
Weakness / Resistance / Retreat Cost:P / / 3
Artist:Ken Sugimori`
    }
  ]
])

function applyCardOverrides(card) {
  if (!card) return null
  const overrides = CARD_METADATA_OVERRIDES.get(card.id)

  return {
    ...card,
    image_url: overrides?.image_url ?? card.image_url ?? null,
    product_details: overrides?.product_details ?? card.product_details ?? null
  }
}

let cachedCatalogPromise = null

async function getStaticCatalog() {
  if (!cachedCatalogPromise) {
    cachedCatalogPromise = loadCatalog()
  }
  return cachedCatalogPromise
}

async function getStaticExpansionSummaries() {
  const { expansions, cardsBySetCode } = await getStaticCatalog()

  return expansions.map((expansion, index) => ({
    id: index + 1,
    set_code: expansion.set_code,
    name: expansion.name ?? null,
    era: expansion.era ?? null,
    language: expansion.language ?? null,
    set_total: expansion.set_total ?? cardsBySetCode?.[expansion.set_code]?.set_total ?? null,
    release_date: expansion.release_date ?? null,
    image_url: expansion.image_url ?? null,
    cards_total: cardsBySetCode?.[expansion.set_code]?.cards?.length ?? 0,
    linked_auctions: 0
  }))
}

// --------------------
// Database
// --------------------
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : undefined
    })
  : null

const MATCH_CONFIDENCE_LEVELS = ['high', 'medium', 'low']
const MATCH_METHODS = [
  'number_first',
  'number_first_tiebreak',
  'auto:number+set',
  'auto:number+name+era',
  'manual',
  'image_only',
  'unmatched'
]

let hasCheckedSalesTable = false
let salesTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
@@ -566,125 +461,50 @@ async function ensureSalesCardIndexAvailable() {
  hasEnsuredSalesCardIndex = indexReady
  return indexReady
}

async function ensureCardInfrastructure() {
  const salesAvailable = await ensureSalesTableAvailable()
  const expansionsAvailable = await ensureExpansionsTableAvailable()
  const cardsAvailable = await ensureCardsTableAvailable()
  if (!salesAvailable || !cardsAvailable || !expansionsAvailable) return false

  const cardColumnAvailable = await ensureSalesCardColumnAvailable()
  const parsedSetCodeAvailable = await ensureSalesParsedSetCodeColumnAvailable()
  const cardIndexAvailable = await ensureSalesCardIndexAvailable()
  const enrichmentColumnsAvailable = await ensureSalesEnrichmentColumnsAvailable()
  const enrichmentIndexesAvailable = await ensureSalesEnrichmentIndexes()

  return Boolean(
    cardColumnAvailable &&
      parsedSetCodeAvailable &&
      cardIndexAvailable &&
      enrichmentColumnsAvailable &&
      enrichmentIndexesAvailable
  )
}
// --------------------
// Linking helpers
// --------------------
function normalizeEra(value) {
  if (!value) return null
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractEraHint(row) {
  const directEra = row?.pokemon_era || row?.era
  const attributeEra = row?.attributes?.pokemon_era

  if (Array.isArray(attributeEra) && attributeEra.length > 0) return attributeEra[0]
  if (typeof attributeEra === 'string') return attributeEra
  return directEra || null
}

let cachedExpansions = null
let lastExpansionFetch = 0

async function fetchCachedExpansions(db) {
@@ -1349,79 +1169,79 @@ async function fetchCardsList({ setCode = null, expansionId = null } = {}) {
      COALESCE(e.set_total, c.set_total) AS set_total,
      c.card_number,
      c.image_url,
      c.product_details,
      c.created_at,
      c.expansion_id,
      COUNT(ts.item_id)::int AS linked_auctions,
      MAX(ts.end_date) AS last_seen
    FROM public.cards c
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
    LEFT JOIN public.tradera_sales ts ON ts.card_id = c.id
    ${whereClause}
    GROUP BY c.id, e.id
    ORDER BY
      CASE
        WHEN c.card_number ~ '^\\d+' THEN (regexp_replace(c.card_number,'[^0-9].*',''))::int
        ELSE 999999
      END,
      c.card_number
  `
  const result = await pool.query(query, params)
  return result.rows.map(applyCardOverrides)
}

async function fetchExpansionSummaries() {
  if (!pool) return getStaticExpansionSummaries()

  try {
    const ok = await ensureCardInfrastructure()
    if (!ok) return getStaticExpansionSummaries()

    const query = `
      SELECT
        e.id,
        e.set_code,
        e.name,
        e.era,
        e.language,
        e.set_total,
        e.release_date,
        e.image_url,
        COUNT(DISTINCT c.id)::int AS cards_total,
        COUNT(ts.item_id)::int AS linked_auctions
      FROM public.expansions e
      LEFT JOIN public.cards c ON c.expansion_id = e.id
      LEFT JOIN public.tradera_sales ts ON ts.card_id = c.id
      GROUP BY e.id
      ORDER BY e.era, e.release_date NULLS LAST, e.set_code
    `
    const result = await pool.query(query)
    return result.rows
  } catch (error) {
    console.error('Falling back to canonical expansions due to DB error', error)
    return getStaticExpansionSummaries()
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
@@ -2057,42 +1877,47 @@ app.get('/api/enrichment/summary', async (_req, res) => {
    })
  } catch (e) {
    res.status(500).json({ available: false, error: String(e) })
  }
})

app.get('/api/enrichment/unmatched', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })
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

// Bootstrap seed
if (pool) {
  ensureCardInfrastructure()
    .then((ok) => {
      if (!ok) return null
      return seedCatalog(pool)
    })
    .catch((error) => {
      console.error('Failed to bootstrap Pokémon catalog', error)
    })
}

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
