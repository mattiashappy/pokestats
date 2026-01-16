// server.js
const express = require('express')
const compression = require('compression')
const path = require('path')
const { existsSync } = require('fs')
const { spawn, spawnSync } = require('child_process')
const { Pool } = require('pg')
const crypto = require('crypto')

const { createExpansionService } = require('./server/routes/expansions')
const { registerTraderaRoutes } = require('./server/routes/tradera')
const { registerAiRoutes } = require('./server/routes/ai')
const { getEraDefinition, normalizeEraCode, resolveEraCode } = require('./server/era')

const { parseAuctionTitle } = require('./scripts/tradera_parser')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

let ensureDashboardBuildResult = null
function ensureDashboardBuild() {
  if (ensureDashboardBuildResult !== null) return ensureDashboardBuildResult

  const hasBuildOutput = existsSync(path.join(distPath, 'index.html'))
  if (hasBuildOutput) {
    ensureDashboardBuildResult = true
    return true
  }

  console.warn('Dashboard build output missing. Attempting a one-time runtime build so dist assets are available.')

  try {
    const { status } = spawnSync('npm', ['run', 'build', '--prefix', 'dashboard'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: process.env
    })

    ensureDashboardBuildResult = status === 0 && existsSync(path.join(distPath, 'index.html'))

    if (ensureDashboardBuildResult) {
      console.info('Dashboard build completed at runtime.')
      return true
    }

    console.error('Runtime dashboard build failed or did not produce dist/index.html')
    ensureDashboardBuildResult = false
    return false
  } catch (error) {
    console.error('Dashboard runtime build threw an error', error)
    ensureDashboardBuildResult = false
    return false
  }
}

app.use(compression())
app.use(express.json())

const DATABASE_URL = process.env.DATABASE_URL
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PYTHON_BIN = process.env.PYTHON_BIN || 'python'
const PRICE_TRACKER_API_KEY = process.env.PRICE_TRACKER_API
const PRICE_TRACKER_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2'

// --------------------
// Card metadata overrides
// --------------------
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

// --------------------
// Price Tracker API helpers
// --------------------
function buildPriceTrackerUrl(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    url.searchParams.set(key, String(value))
  })
  return url
}

async function fetchPriceTracker(endpoint, params = {}) {
  if (!PRICE_TRACKER_API_KEY) {
    throw new Error('PRICE_TRACKER_API not set')
  }

  const url = buildPriceTrackerUrl(endpoint, params)
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PRICE_TRACKER_API_KEY}`
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Price Tracker request failed (${response.status}): ${body}`)
  }

  return response.json()
}

function normalizePriceTrackerCards(payload) {
  const data = payload?.data ?? null
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

function buildPriceTrackerProductDetails(card) {
  const marketPrice =
    card?.prices && card.prices.market != null ? `Market price: $${card.prices.market}` : null
  const listingCount =
    card?.prices && card.prices.listings != null ? `Listings: ${card.prices.listings}` : null
  const details = [
    card.cardType ? `Card type: ${card.cardType}` : null,
    card.rarity ? `Rarity: ${card.rarity}` : null,
    card.stage ? `Stage: ${card.stage}` : null,
    Number.isFinite(Number(card.hp)) ? `HP: ${card.hp}` : null,
    card.artist ? `Artist: ${card.artist}` : null,
    card.tcgPlayerUrl ? `TCGPlayer: ${card.tcgPlayerUrl}` : null,
    marketPrice,
    listingCount,
    card.prices?.primaryCondition ? `Primary condition: ${card.prices.primaryCondition}` : null,
    card.prices?.primaryPrinting ? `Primary printing: ${card.prices.primaryPrinting}` : null,
    card.prices?.lastUpdated ? `Last updated: ${card.prices.lastUpdated}` : null
  ].filter(Boolean)

  return details.length ? details.join('\n') : null
}

function formatUsd(value) {
  const parsed = Number(value)
  if (Number.isFinite(parsed)) return parsed.toFixed(2)
  if (value === null || value === undefined) return null
  const fallback = String(value).trim()
  return fallback ? fallback : null
}

function buildPtCardDetails(card) {
  if (!card) return null
  const marketPrice =
    card.price_market != null ? `Market price: $${formatUsd(card.price_market)}` : null
  const listingCount = card.price_listings != null ? `Listings: ${card.price_listings}` : null

  const details = [
    card.card_type ? `Card type: ${card.card_type}` : null,
    card.rarity ? `Rarity: ${card.rarity}` : null,
    card.stage ? `Stage: ${card.stage}` : null,
    Number.isFinite(Number(card.hp)) ? `HP: ${card.hp}` : null,
    card.artist ? `Artist: ${card.artist}` : null,
    card.tcgplayer_url ? `TCGPlayer: ${card.tcgplayer_url}` : null,
    marketPrice,
    listingCount,
    card.price_primary_condition ? `Primary condition: ${card.price_primary_condition}` : null,
    card.price_primary_printing ? `Primary printing: ${card.price_primary_printing}` : null,
    card.price_last_updated ? `Last updated: ${card.price_last_updated}` : null
  ].filter(Boolean)

  return details.length ? details.join('\n') : null
}

async function fetchExpansionBySetCodeOrName(setCode) {
  if (!pool) return null
  const ok = await ensureExpansionsTableAvailable()
  if (!ok) return null

  const query = `
    SELECT id, set_name, set_code, era, set_total
    FROM public.expansions
    WHERE LOWER(set_code) = LOWER($1)
       OR LOWER(set_name) = LOWER($1)
    LIMIT 1
  `
  const { rows } = await pool.query(query, [setCode])
  return rows[0] ?? null
}

async function fetchExpansionBySetName(setName) {
  if (!pool) return null
  const ok = await ensureExpansionsTableAvailable()
  if (!ok) return null

  const query = `
    SELECT id, set_name, set_code, era, set_total
    FROM public.expansions
    WHERE LOWER(set_name) = LOWER($1)
    LIMIT 1
  `
  const { rows } = await pool.query(query, [setName])
  return rows[0] ?? null
}

async function fetchExpansionById(expansionId) {
  if (!pool) return null
  const ok = await ensureExpansionsTableAvailable()
  if (!ok) return null

  const { rows } = await pool.query(
    `
      SELECT id, set_name, set_code, era, set_total
      FROM public.expansions
      WHERE id = $1
      LIMIT 1
    `,
    [expansionId]
  )

  return rows[0] ?? null
}

function mapPriceTrackerCard(card, { expansion = null, setCodeOverride = null } = {}) {
  const parsedId = Number(card?.tcgPlayerId)
  const setName = card?.setName ?? expansion?.set_name ?? null
  const setCode = setCodeOverride ?? expansion?.set_code ?? null
  const setTotal = Number.isFinite(Number(card?.totalSetNumber))
    ? Number(card.totalSetNumber)
    : expansion?.set_total ?? null
  const imageUrl =
    card?.imageCdnUrl800 ??
    card?.imageCdnUrl400 ??
    card?.imageCdnUrl200 ??
    card?.imageCdnUrl ??
    null

  return applyCardOverrides({
    id: Number.isFinite(parsedId) ? parsedId : 0,
    name: card?.name ?? null,
    era: expansion?.era ?? null,
    set_name: setName,
    set_code: setCode,
    set_total: setTotal,
    card_number: card?.cardNumber ?? null,
    image_url: imageUrl,
    product_details: buildPriceTrackerProductDetails(card),
    expansion_id: expansion?.id ?? null,
    created_at: null
  })
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

let hasCheckedTraderaAuctionsTable = false
let traderaAuctionsTableAvailable = false
let hasCheckedTraderaAuctionLinksTable = false
let traderaAuctionLinksTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasCheckedExpansionsTable = false
let expansionsTableAvailable = false
let hasCheckedImportRunsTable = false
let importRunsTableAvailable = false
let ensureCardInfrastructurePromise = null
let hasCheckedErasTable = false
let erasTableAvailable = false

async function ensureColumnExists(tableName, columnName, definition) {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName]
  )

  if (rows.length > 0) return true

  try {
    await pool.query(`ALTER TABLE public.${tableName} ADD COLUMN ${columnName} ${definition}`)
    return true
  } catch (error) {
    console.error(`Failed to add ${columnName} column to ${tableName}`, error)
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

  const trimmedDefinition = definition.trim()
  const isUnique = trimmedDefinition.toUpperCase().startsWith('UNIQUE ')
  const indexDefinition = isUnique ? trimmedDefinition.replace(/^UNIQUE\s+/i, '') : trimmedDefinition

  const createStatement = isUnique
    ? `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON public.${tableName} ${indexDefinition}`
    : `CREATE INDEX IF NOT EXISTS ${indexName} ON public.${tableName} ${indexDefinition}`

  try {
    await pool.query(createStatement)
    return true
  } catch (error) {
    console.error(`Failed to create ${indexName} on ${tableName}`, error)
    return false
  }
}

async function ensureConstraintExists(tableName, constraintName, definition) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.conname = $2
    `,
    [tableName, constraintName]
  )

  if (rows.length > 0) return true

  try {
    await pool.query(`ALTER TABLE public.${tableName} ADD CONSTRAINT ${constraintName} ${definition}`)
    return true
  } catch (error) {
    console.error(`Failed to create constraint ${constraintName} on ${tableName}`, error)
    return false
  }
}

async function dropConstraintIfExists(tableName, constraintName) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.conname = $2
    `,
    [tableName, constraintName]
  )

  if (rows.length === 0) return true

  try {
    await pool.query(`ALTER TABLE public.${tableName} DROP CONSTRAINT IF EXISTS ${constraintName}`)
    return true
  } catch (error) {
    console.error(`Failed to drop constraint ${constraintName} on ${tableName}`, error)
    return false
  }
}

async function ensureImportRunsTable() {
  if (!pool) return false
  if (hasCheckedImportRunsTable) return importRunsTableAvailable

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.import_runs (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'tradera',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        new_rows INTEGER NOT NULL DEFAULT 0,
        pages_fetched INTEGER NOT NULL DEFAULT 0,
        requests_used INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        message TEXT,
        run_uuid TEXT,
        error_stack TEXT
      )
    `)

    const runUuidColumnReady = await ensureColumnExists('import_runs', 'run_uuid', 'TEXT')
    const errorStackColumnReady = await ensureColumnExists('import_runs', 'error_stack', 'TEXT')
    const [startIndexReady, runUuidIndexReady] = await Promise.all([
      ensureIndexExists('import_runs', 'idx_import_runs_started_at', '(started_at DESC)'),
      ensureIndexExists('import_runs', 'idx_import_runs_run_uuid', '(run_uuid)')
    ])

    importRunsTableAvailable = Boolean(startIndexReady && runUuidColumnReady && errorStackColumnReady && runUuidIndexReady)
  } catch (error) {
    console.error('Failed to ensure import_runs table exists', error)
    importRunsTableAvailable = false
  }

  hasCheckedImportRunsTable = true
  return importRunsTableAvailable
}

async function ensureTraderaAuctionsTableAvailable() {
  if (!pool) return false
  if (hasCheckedTraderaAuctionsTable) return traderaAuctionsTableAvailable

  const { rows } = await pool.query("SELECT to_regclass('public.tradera_auctions') AS tradera_auctions")
  traderaAuctionsTableAvailable = Boolean(rows?.[0]?.tradera_auctions)
  hasCheckedTraderaAuctionsTable = true

  if (!traderaAuctionsTableAvailable) console.warn('tradera_auctions table does not exist')
  return traderaAuctionsTableAvailable
}

async function ensureTraderaAuctionLinksTableAvailable() {
  if (!pool) return false
  if (hasCheckedTraderaAuctionLinksTable) return traderaAuctionLinksTableAvailable

  const { rows } = await pool.query(
    "SELECT to_regclass('public.tradera_auction_card_links') AS tradera_auction_card_links"
  )
  traderaAuctionLinksTableAvailable = Boolean(rows?.[0]?.tradera_auction_card_links)
  hasCheckedTraderaAuctionLinksTable = true

  if (!traderaAuctionLinksTableAvailable) {
    console.warn('tradera_auction_card_links table does not exist')
  }
  return traderaAuctionLinksTableAvailable
}

async function ensureErasTableAvailable() {
  if (!pool) return false
  if (hasCheckedErasTable) return erasTableAvailable

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.eras (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        start_year INTEGER,
        end_year INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const codeIndexReady = await ensureIndexExists('eras', 'idx_eras_code', 'UNIQUE (code)')
    const sortIndexReady = await ensureIndexExists('eras', 'idx_eras_sort_order', '(sort_order)')

    erasTableAvailable = Boolean(codeIndexReady && sortIndexReady)
  } catch (error) {
    console.error('Failed to ensure eras table exists', error)
    erasTableAvailable = false
  }

  hasCheckedErasTable = true
  return erasTableAvailable
}

// ✅ single canonical expansions definition
async function ensureExpansionsTableAvailable() {
  if (!pool) return false
  if (hasCheckedExpansionsTable) return expansionsTableAvailable

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.expansions (
        id SERIAL PRIMARY KEY,
        set_code TEXT NOT NULL UNIQUE,
        set_name TEXT NOT NULL,
        era TEXT,
        base_total INTEGER,
        set_total INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const hasSetName = await ensureColumnExists('expansions', 'set_name', 'TEXT')
    const hasBaseTotal = await ensureColumnExists('expansions', 'base_total', 'INTEGER')
    const hasSetTotal = await ensureColumnExists('expansions', 'set_total', 'INTEGER')
    const hasEraIndex = await ensureIndexExists('expansions', 'idx_expansions_era', '(era)')

    expansionsTableAvailable = Boolean(hasSetName && hasBaseTotal && hasSetTotal && hasEraIndex)
  } catch (error) {
    console.error('Failed to ensure expansions table exists', error)
    expansionsTableAvailable = false
  }

  hasCheckedExpansionsTable = true
  return expansionsTableAvailable
}

async function ensureCardsTableAvailable() {
  if (!pool) return false
  if (hasCheckedCardsTable) return cardsTableAvailable

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.cards (
        id SERIAL PRIMARY KEY,
        expansion_id INTEGER NOT NULL REFERENCES public.expansions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        collector_number_raw TEXT NOT NULL,
        collector_key TEXT,
        number INTEGER,
        printed_total INTEGER,
        is_secret BOOLEAN,
        image_url TEXT,
        source TEXT NOT NULL DEFAULT 'json',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const expansionOk = await ensureColumnExists(
      'cards',
      'expansion_id',
      'INTEGER REFERENCES public.expansions(id) ON DELETE CASCADE'
    )
    const collectorRawOk = await ensureColumnExists('cards', 'collector_number_raw', 'TEXT')
    const collectorKeyOk = await ensureColumnExists('cards', 'collector_key', 'TEXT')
    const numberOk = await ensureColumnExists('cards', 'number', 'INTEGER')
    const printedTotalOk = await ensureColumnExists('cards', 'printed_total', 'INTEGER')
    const isSecretOk = await ensureColumnExists('cards', 'is_secret', 'BOOLEAN')
    const imageUrlOk = await ensureColumnExists('cards', 'image_url', 'TEXT')
    const sourceOk = await ensureColumnExists('cards', 'source', "TEXT DEFAULT 'json'")

    const collectorKeyCheck = await ensureConstraintExists(
      'cards',
      'cards_collector_key_format',
      "CHECK (collector_key IS NULL OR collector_key ~ '^\\\\d+/\\\\d+$')"
    )
    const numberPairCheck = await ensureConstraintExists(
      'cards',
      'cards_number_pair_consistency',
      'CHECK ((number IS NULL AND printed_total IS NULL) OR (number IS NOT NULL AND printed_total IS NOT NULL))'
    )

    const uniqueByCollectorKey = await ensureIndexExists(
      'cards',
      'cards_unique_expansion_collectorkey',
      'UNIQUE (expansion_id, collector_key) WHERE collector_key IS NOT NULL'
    )
    const uniqueByRaw = await ensureIndexExists(
      'cards',
      'cards_unique_expansion_raw',
      'UNIQUE (expansion_id, collector_number_raw)'
    )
    const expansionNumberIdx = await ensureIndexExists(
      'cards',
      'idx_cards_expansion_number',
      '(expansion_id, number) WHERE number IS NOT NULL'
    )
    const nameIdx = await ensureIndexExists('cards', 'idx_cards_name', '(name)')

    cardsTableAvailable = Boolean(
      expansionOk &&
        collectorRawOk &&
        collectorKeyOk &&
        numberOk &&
        printedTotalOk &&
        isSecretOk &&
        imageUrlOk &&
        sourceOk &&
        collectorKeyCheck &&
        numberPairCheck &&
        uniqueByCollectorKey &&
        uniqueByRaw &&
        expansionNumberIdx &&
        nameIdx
    )
  } catch (error) {
    console.error('Failed to ensure cards table exists', error)
    cardsTableAvailable = false
  }

  hasCheckedCardsTable = true
  return cardsTableAvailable
}

async function ensurePriceTrackerImportTablesAvailable() {
  if (!pool) return false

  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.pt_sets') AS pt_sets,
      to_regclass('public.pt_cards') AS pt_cards
  `)

  return Boolean(rows?.[0]?.pt_sets && rows?.[0]?.pt_cards)
}

async function ensureCardInfrastructure() {
  if (!pool) return false
  if (ensureCardInfrastructurePromise) return ensureCardInfrastructurePromise

  ensureCardInfrastructurePromise = (async () => {
    try {
      const [expansionsReady, cardsReady] = await Promise.all([
        ensureExpansionsTableAvailable(),
        ensureCardsTableAvailable()
      ])

      if (!expansionsReady || !cardsReady) return false

      return true
    } catch (error) {
      console.error('Failed to ensure card infrastructure', error)
      return false
    }
  })()

  return ensureCardInfrastructurePromise
}

async function fetchErasFromDatabase() {
  if (!pool) return []
  const erasReady = await ensureErasTableAvailable()
  if (!erasReady) return []

  const ptReady = await ensurePriceTrackerImportTablesAvailable()

  const { rows: eraRows } = await pool.query(`
    SELECT id, code, name, sort_order, start_year, end_year
    FROM public.eras
    ORDER BY sort_order, start_year, name
  `)

  const { rows: expansionRows } = ptReady
    ? await pool.query(`
        SELECT series AS era, COUNT(*)::int AS sets_total
        FROM public.pt_sets
        WHERE series IS NOT NULL
        GROUP BY series
      `)
    : await pool.query(`
        SELECT era, COUNT(*)::int AS sets_total
        FROM public.expansions
        WHERE era IS NOT NULL
        GROUP BY era
      `)

  const byCode = new Map(
    eraRows.map((row) => [
      normalizeEraCode(row.code),
      { ...row, sets_total: 0 }
    ])
  )

  for (const expansion of expansionRows) {
    const code = resolveEraCode(expansion.era)
    if (!code) continue
    const normalized = normalizeEraCode(code)
    const existing = byCode.get(normalized)
    if (existing) {
      existing.sets_total += expansion.sets_total
      continue
    }

    const definition = getEraDefinition(code)

    byCode.set(normalizeEraCode(code), {
      id: null,
      code: definition?.code ?? code,
      name: definition?.name ?? expansion.era,
      sort_order: definition?.sort_order ?? 999,
      start_year: definition?.start_year ?? null,
      end_year: definition?.end_year ?? null,
      sets_total: expansion.sets_total
    })
  }

  return Array.from(byCode.values()).sort((a, b) => {
    const orderDiff = (a.sort_order ?? 999) - (b.sort_order ?? 999)
    if (orderDiff !== 0) return orderDiff
    return String(a.name).localeCompare(String(b.name))
  })
}

async function fetchErasList() {
  if (!pool) return []
  return fetchErasFromDatabase()
}

// --------------------
// Routes that depend on ensureCardInfrastructure
// (moved here to avoid TDZ/ReferenceError)
// --------------------
const { registerRoutes: registerExpansionRoutes, fetchExpansionSummaries } = createExpansionService({
  pool,
  ensureCardInfrastructure,
  ensureTraderaAuctionLinksTableAvailable
})

function normalizeTraderaAuctionRow(row) {
  return {
    itemId: row.item_id,
    title: row.title ?? null,
    endDate: row.end_date,
    price: row.price ?? null,
    bidCount: row.bid_count ?? null,
    sellerAlias: row.seller_alias ?? null,
    itemUrl: row.item_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    pokemonEra: row.pokemon_era ?? null,
    pokemonLanguage: row.pokemon_language ?? null,
    itemCondition: row.item_condition ?? null
  }
}

function normalizeAuctionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCardNumber(text) {
  const match = text.match(/\b([A-Za-z]{1,3})?\s*(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (match) {
    const prefix = match[1] ? String(match[1]).toUpperCase().trim() : ''
    return `${prefix}${match[2]}/${match[3]}`
  }

  const hashMatch = text.match(/(?:#|no\.?\s*)(\d{1,4})\b/i)
  if (hashMatch) return hashMatch[1]

  return null
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchExpansion(expansions, text) {
  let bestMatch = null
  let bestScore = 0

  for (const expansion of expansions) {
    const candidates = [expansion.normalizedName, expansion.normalizedCode].filter(Boolean)
    for (const candidate of candidates) {
      const regex = new RegExp(`\\b${escapeRegex(candidate)}\\b`)
      if (regex.test(text)) {
        const score = candidate.length
        if (score > bestScore) {
          bestScore = score
          bestMatch = expansion
        }
      }
    }
  }

  return bestMatch
}

async function fetchAuctionsFromDatabase(filters = {}) {
  if (!pool) return []
  const ok = await ensureTraderaAuctionsTableAvailable()
  if (!ok) return []

  const { era = null, language = null, minPrice = null, maxPrice = null, limit = null, offset = 0 } = filters

  let query = `
    SELECT
      a.item_id,
      a.title,
      a.end_date,
      a.pokemon_era,
      a.pokemon_language,
      a.item_condition,
      a.price,
      a.bid_count,
      a.item_url,
      a.thumbnail_url,
      a.seller_alias
    FROM public.tradera_auctions a
    WHERE
      ($1::text IS NULL OR a.pokemon_era = $1)
      AND ($2::text IS NULL OR a.pokemon_language = $2)
      AND ($3::int IS NULL OR a.price >= $3)
      AND ($4::int IS NULL OR a.price <= $4)
    ORDER BY a.end_date DESC
  `
  const params = [era, language, minPrice, maxPrice]

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.push(limit)
    query += ` LIMIT $${params.length}`

    if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
      params.push(offset)
      query += ` OFFSET $${params.length}`
    }
  }

  const { rows } = await pool.query(query, params)
  return rows.map(normalizeTraderaAuctionRow)
}

async function fetchCardFromDatabase(cardId) {
  if (!Number.isFinite(cardId)) return null
  if (!pool) return null

  const ok = await ensureCardInfrastructure()
  if (!ok) return null

  const query = `
    SELECT
      c.id,
      c.name,
      e.era AS era,
      e.set_name AS set_name,
      e.set_code AS set_code,
      e.set_total AS set_total,
      c.collector_number_raw AS card_number,
      c.image_url,
      NULL::text AS product_details,
      c.created_at,
      c.expansion_id
    FROM public.cards c
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
    WHERE c.id = $1
  `
  const result = await pool.query(query, [cardId])
  if (result.rows.length === 0) return null
  return applyCardOverrides(result.rows[0])
}

async function fetchCardAuctions(cardId, { limit = 500 } = {}) {
  if (!pool) return []
  const [linksReady, auctionsReady] = await Promise.all([
    ensureTraderaAuctionLinksTableAvailable(),
    ensureTraderaAuctionsTableAvailable()
  ])
  if (!linksReady || !auctionsReady) return []

  const query = `
    SELECT
      a.item_id,
      a.title,
      a.end_date,
      a.pokemon_era,
      a.pokemon_language,
      a.item_condition,
      a.price,
      a.bid_count,
      a.item_url,
      a.thumbnail_url,
      a.seller_alias
    FROM public.tradera_auction_card_links l
    JOIN public.tradera_auctions a ON a.item_id = l.auction_id
    WHERE l.card_id = $1
    ORDER BY a.end_date DESC
    LIMIT $2
  `
  const result = await pool.query(query, [cardId, limit])
  return result.rows.map(normalizeTraderaAuctionRow)
}

async function fetchLinkingExpansions() {
  if (!pool) return []
  const ok = await ensureExpansionsTableAvailable()
  if (!ok) return []

  const { rows } = await pool.query(`
    SELECT id, set_name, set_code
    FROM public.expansions
    WHERE set_name IS NOT NULL OR set_code IS NOT NULL
  `)

  return rows.map((row) => ({
    id: row.id,
    name: row.set_name,
    set_code: row.set_code,
    normalizedName: row.set_name ? normalizeAuctionText(row.set_name) : null,
    normalizedCode: row.set_code ? normalizeAuctionText(row.set_code) : null
  }))
}

async function fetchUnlinkedAuctions(limit = null) {
  if (!pool) return []
  const [linksReady, auctionsReady] = await Promise.all([
    ensureTraderaAuctionLinksTableAvailable(),
    ensureTraderaAuctionsTableAvailable()
  ])
  if (!linksReady || !auctionsReady) return []

  let query = `
    SELECT a.item_id, a.title, a.description
    FROM public.tradera_auctions a
    LEFT JOIN public.tradera_auction_card_links l ON l.auction_id = a.item_id
    WHERE l.auction_id IS NULL
    ORDER BY a.end_date DESC
  `
  const params = []

  if (Number.isFinite(limit)) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const { rows } = await pool.query(query, params)
  return rows
}

async function fetchUnlinkedAuctionSummaries(limit = null) {
  if (!pool) return []
  const [linksReady, auctionsReady] = await Promise.all([
    ensureTraderaAuctionLinksTableAvailable(),
    ensureTraderaAuctionsTableAvailable()
  ])
  if (!linksReady || !auctionsReady) return []

  const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
  const safeLimit = hasLimit ? Math.min(Math.max(limit, 1), 2000) : null
  const limitClause = safeLimit ? 'LIMIT $1' : ''
  const params = safeLimit ? [safeLimit] : []
  const { rows } = await pool.query(
    `
      SELECT
        a.item_id,
        a.title,
        a.description,
        a.end_date,
        a.price,
        a.bid_count,
        a.item_url,
        a.seller_alias,
        a.pokemon_era,
        a.pokemon_language,
        a.item_condition
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_card_links l ON l.auction_id = a.item_id
      WHERE l.auction_id IS NULL
      ORDER BY a.end_date DESC
      ${limitClause}
    `,
    params
  )

  const expansions = await fetchLinkingExpansions()

  return rows.map((row) => {
    const text = normalizeAuctionText(`${row.title ?? ''} ${row.description ?? ''}`)
    const collectorNumber = extractCardNumber(text)
    const expansion = matchExpansion(expansions, text)

    return {
      item_id: row.item_id,
      title: row.title ?? null,
      description: row.description ?? null,
      end_date: row.end_date ?? null,
      price: row.price ?? null,
      bid_count: row.bid_count ?? null,
      item_url: row.item_url ?? null,
      seller_alias: row.seller_alias ?? null,
      pokemon_era: row.pokemon_era ?? null,
      pokemon_language: row.pokemon_language ?? null,
      item_condition: row.item_condition ?? null,
      detected_collector_number: collectorNumber ?? null,
      detected_expansion_name: expansion?.name ?? null,
      detected_expansion_code: expansion?.set_code ?? null
    }
  })
}

async function runDeterministicLinker({ limit = null } = {}) {
  if (!pool) return { total: 0, linked: 0, skipped: 0 }

  const expansions = await fetchLinkingExpansions()
  const auctions = await fetchUnlinkedAuctions(limit)
  let linked = 0
  let skipped = 0

  for (const auction of auctions) {
    const text = normalizeAuctionText(`${auction.title || ''} ${auction.description || ''}`)
    const collectorKey = extractCardNumber(text)
    if (!collectorKey) {
      skipped += 1
      continue
    }

    const expansion = matchExpansion(expansions, text)
    if (!expansion) {
      skipped += 1
      continue
    }

    const { rows } = await pool.query(
      `
        SELECT id
        FROM public.cards
        WHERE expansion_id = $1
          AND collector_key = $2
      `,
      [expansion.id, collectorKey]
    )

    if (rows.length !== 1) {
      skipped += 1
      continue
    }

    const cardId = rows[0].id
    await pool.query(
      `
        INSERT INTO public.tradera_auction_card_links (auction_id, card_id, method, confidence, created_at)
        VALUES ($1, $2, 'deterministic', 1.0, NOW())
        ON CONFLICT (auction_id)
        DO UPDATE SET
          card_id = EXCLUDED.card_id,
          method = 'deterministic',
          confidence = 1.0,
          created_at = NOW()
      `,
      [auction.item_id, cardId]
    )

    linked += 1
  }

  return {
    total: auctions.length,
    linked,
    skipped
  }
}

async function runAuctionTitleParser({ limit = null } = {}) {
  if (!pool) return { total: 0, withCollectorKey: 0, withSetHint: 0, bundleCount: 0 }

  const auctions = await fetchUnlinkedAuctions(limit)
  let withCollectorKey = 0
  let withSetHint = 0
  let bundleCount = 0

  for (const auction of auctions) {
    const parsed = parseAuctionTitle(`${auction.title || ''} ${auction.description || ''}`)
    if (parsed.collectorKey) withCollectorKey += 1
    if (parsed.setHint) withSetHint += 1
    if (parsed.isBundle) bundleCount += 1
  }

  return {
    total: auctions.length,
    withCollectorKey,
    withSetHint,
    bundleCount
  }
}

function extractImporterError(stdout, stderr) {
  const lines = `${stdout}\n${stderr}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed?.error) return parsed.error
      if (parsed?.message) return parsed.message
    } catch {
      // not JSON
    }

    if (line) return line
  }

  return null
}

function ensureImporterRuntime() {
  const scriptPath = path.join(__dirname, 'scripts', 'tradera_importer.py')

  if (!existsSync(scriptPath)) {
    throw new Error(`Importer script missing at ${scriptPath}`)
  }

  const { error } = spawnSync(PYTHON_BIN, ['--version'], {
    cwd: __dirname,
    env: process.env
  })

  if (error) {
    throw new Error(`Python runtime not available (tried "${PYTHON_BIN}")`)
  }

  return scriptPath
}

function runImporterScript(runUuid) {
  return new Promise((resolve, reject) => {
    const scriptPath = ensureImporterRuntime()
    const child = spawn(PYTHON_BIN, [scriptPath], {
      cwd: __dirname,
      env: { ...process.env, IMPORT_RUN_UUID: runUuid },
      shell: false
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

async function fetchCardsListFromDatabase({ setCode = null, expansionId = null } = {}) {
  if (!pool) return []
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

  const [linksReady, auctionsReady] = await Promise.all([
    ensureTraderaAuctionLinksTableAvailable(),
    ensureTraderaAuctionsTableAvailable()
  ])
  const canJoinAuctions = linksReady && auctionsReady

  let whereClause = ''
  const params = []

  if (Number.isFinite(expansionId)) {
    whereClause = 'WHERE c.expansion_id = $1'
    params.push(Number(expansionId))
  } else if (setCode) {
    whereClause = `
      WHERE LOWER(e.set_code) = LOWER($1)
         OR LOWER(e.set_name) = LOWER($1)
    `
    params.push(setCode.trim())
  }

  const query = `
    SELECT
      c.id,
      c.name,
      e.era AS era,
      e.set_name AS set_name,
      e.set_code AS set_code,
      e.set_total AS set_total,
      c.collector_number_raw AS card_number,
      c.image_url,
      NULL::text AS product_details,
      c.created_at,
      c.expansion_id,
      ${canJoinAuctions ? 'COUNT(a.item_id)::int' : '0::int'} AS linked_auctions,
      ${canJoinAuctions ? 'MAX(a.end_date)' : 'NULL::timestamptz'} AS last_seen
    FROM public.cards c
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
    ${canJoinAuctions ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
    ${canJoinAuctions ? 'LEFT JOIN public.tradera_auctions a ON a.item_id = l.auction_id' : ''}
    ${whereClause}
    GROUP BY c.id, e.id
    ORDER BY COALESCE(c.number, 999999), c.collector_number_raw
  `
  const result = await pool.query(query, params)
  return result.rows.map(applyCardOverrides)
}

async function fetchCardsListFromPtImport({ setCode = null, search = null, limit = null, offset = 0 } = {}) {
  if (!pool) return []
  const ok = await ensurePriceTrackerImportTablesAvailable()
  if (!ok) return []

  const params = []
  const clauses = []

  if (setCode) {
    params.push(setCode.trim())
    clauses.push('(LOWER(c.pt_set_id) = LOWER($1) OR LOWER(c.set_name) = LOWER($1) OR LOWER(s.name) = LOWER($1))')
  }

  if (search) {
    params.push(`%${search}%`)
    clauses.push(
      `(c.name ILIKE $${params.length} OR c.card_number ILIKE $${params.length} OR c.set_name ILIKE $${params.length} OR s.name ILIKE $${params.length} OR s.pt_set_id ILIKE $${params.length})`
    )
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const useLimit = Number.isFinite(Number(limit))
  if (useLimit) {
    params.push(Number(limit))
    params.push(Number(offset))
  }

  const query = `
    SELECT
      c.pt_card_id AS id,
      c.name,
      s.series AS era,
      COALESCE(s.name, c.set_name) AS set_name,
      c.pt_set_id AS set_code,
      COALESCE(s.card_count, NULLIF(split_part(c.total_set_number, '/', 2), '')::int) AS set_total,
      c.card_number AS card_number,
      COALESCE(c.image_cdn_url400, c.image_cdn_url, c.image_url) AS image_url,
      NULL::text AS product_details,
      c.updated_at AS created_at,
      NULL::int AS expansion_id,
      0::int AS linked_auctions,
      NULL::timestamptz AS last_seen
    FROM public.pt_cards c
    LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
    ${whereClause}
    ORDER BY c.card_number NULLS LAST, c.name NULLS LAST
    ${useLimit ? `LIMIT $${params.length - 1} OFFSET $${params.length}` : ''}
  `

  const result = await pool.query(query, params)
  return result.rows
}

async function fetchCardFromPtImport(cardId) {
  if (!cardId) return null
  if (!pool) return null
  const ok = await ensurePriceTrackerImportTablesAvailable()
  if (!ok) return null

  const query = `
    SELECT
      c.pt_card_id AS id,
      c.name,
      s.series AS era,
      COALESCE(s.name, c.set_name) AS set_name,
      c.pt_set_id AS set_code,
      COALESCE(s.card_count, NULLIF(split_part(c.total_set_number, '/', 2), '')::int) AS set_total,
      c.card_number AS card_number,
      COALESCE(c.image_cdn_url400, c.image_cdn_url, c.image_url) AS image_url,
      c.rarity,
      c.card_type,
      c.hp,
      c.stage,
      c.artist,
      c.tcgplayer_url,
      c.price_market,
      c.price_listings,
      c.price_primary_condition,
      c.price_primary_printing,
      c.price_last_updated,
      c.updated_at AS created_at,
      NULL::int AS expansion_id
    FROM public.pt_cards c
    LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
    WHERE c.pt_card_id = $1
       OR c.tcgplayer_product_id::text = $1
    LIMIT 1
  `

  const result = await pool.query(query, [String(cardId)])
  const row = result.rows[0]
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    era: row.era ?? null,
    set_name: row.set_name ?? null,
    set_code: row.set_code ?? null,
    set_total: row.set_total ?? null,
    card_number: row.card_number ?? null,
    image_url: row.image_url ?? null,
    product_details: buildPtCardDetails(row),
    expansion_id: null,
    created_at: row.created_at ?? null
  }
}

async function fetchCardsListFromPriceTracker({ setCode = null, search = null, limit = 100, offset = 0 } = {}) {
  const params = {
    language: 'english',
    limit,
    offset,
    includeHistory: 'false',
    includeEbay: 'false',
    includeBoth: 'false',
    days: 30
  }

  let expansion = null
  let setName = null

  if (setCode) {
    expansion = await fetchExpansionBySetCodeOrName(setCode)
    setName = expansion?.set_name ?? setCode
    params.set = setName
  }

  if (search) {
    params.search = search
  }

  const payload = await fetchPriceTracker('/cards', params)
  const cards = normalizePriceTrackerCards(payload)

  return cards.map((card) =>
    ({
      ...mapPriceTrackerCard(card, { expansion, setCodeOverride: expansion?.set_code ?? setCode ?? null }),
      linked_auctions: 0,
      last_seen: null
    })
  )
}

async function fetchCardFromPriceTracker(cardId) {
  const params = {
    language: 'english',
    tcgPlayerId: cardId,
    limit: 1,
    offset: 0,
    includeHistory: 'false',
    includeEbay: 'false',
    includeBoth: 'false',
    days: 30
  }
  const payload = await fetchPriceTracker('/cards', params)
  const cards = normalizePriceTrackerCards(payload)
  if (!cards.length) return null

  const card = cards[0]
  const expansion = card?.setName ? await fetchExpansionBySetName(card.setName) : null

  return mapPriceTrackerCard(card, {
    expansion,
    setCodeOverride: expansion?.set_code ?? null
  })
}

async function fetchCardSearchFromPriceTracker(query, limit = 50) {
  const params = {
    language: 'english',
    search: query,
    limit,
    offset: 0,
    includeHistory: 'false',
    includeEbay: 'false',
    includeBoth: 'false',
    days: 30
  }

  const payload = await fetchPriceTracker('/cards', params)
  const cards = normalizePriceTrackerCards(payload)

  return cards.map((card) => {
    const parsedId = Number(card?.tcgPlayerId)
    return {
      id: Number.isFinite(parsedId) ? parsedId : 0,
      name: card?.name ?? null,
      cardNumber: card?.cardNumber ?? null,
      setName: card?.setName ?? null,
      setCode: card?.setName ?? null,
      era: null
    }
  })
}

async function fetchCardSearchFromPtImport(query, limit = 50) {
  if (!pool) return []
  const ok = await ensurePriceTrackerImportTablesAvailable()
  if (!ok) return []

  const needle = `%${query}%`
  const { rows } = await pool.query(
    `
      SELECT
        c.pt_card_id AS id,
        c.name,
        c.card_number AS card_number,
        COALESCE(s.name, c.set_name) AS set_name,
        c.pt_set_id AS set_code,
        s.series AS era
      FROM public.pt_cards c
      LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
      WHERE
        c.name ILIKE $1
        OR c.card_number ILIKE $1
        OR c.set_name ILIKE $1
        OR s.name ILIKE $1
        OR c.pt_set_id ILIKE $1
      ORDER BY
        c.name NULLS LAST,
        c.card_number NULLS LAST
      LIMIT $2
    `,
    [needle, limit]
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? null,
    cardNumber: row.card_number ?? null,
    setName: row.set_name ?? null,
    setCode: row.set_code ?? null,
    era: row.era ?? null
  }))
}

async function fetchCardSearchFromDatabase(query, limit = 50) {
  if (!pool) return []
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

  const needle = `%${query}%`

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.collector_number_raw AS card_number,
        e.set_name,
        e.set_code,
        e.era
      FROM public.cards c
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
      WHERE
        c.name ILIKE $1
        OR c.collector_number_raw ILIKE $1
        OR e.set_name ILIKE $1
        OR e.set_code ILIKE $1
      ORDER BY
        c.name NULLS LAST,
        c.collector_number_raw NULLS LAST
      LIMIT $2
    `,
    [needle, limit]
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? null,
    cardNumber: row.card_number ?? null,
    setName: row.set_name ?? null,
    setCode: row.set_code ?? null,
    era: row.era ?? null
  }))
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

registerExpansionRoutes(app)
registerTraderaRoutes(app, { pool })
registerAiRoutes(app, { pool })

app.get('/api/eras', async (_req, res) => {
  try {
    const eras = await fetchErasList()
    res.json(eras)
  } catch (error) {
    console.error('Failed to fetch eras', error)
    res.status(500).json({ error: 'Failed to load eras' })
  }
})

app.get('/api/eras/:code/expansions', async (req, res) => {
  try {
    const requestedCode = normalizeEraCode(req.params.code)
    if (!requestedCode) return res.status(400).json({ error: 'Invalid era code' })

    const expansions = await fetchExpansionSummaries()

    const filtered = expansions.filter((expansion) => {
      const expansionCode = normalizeEraCode(expansion.era_code ?? resolveEraCode(expansion.era))
      return expansionCode === requestedCode
    })

    return res.json(filtered)
  } catch (error) {
    console.error('Failed to fetch expansions for era', error)
    return res.status(500).json({ error: 'Failed to load era expansions' })
  }
})

app.get('/api/sales', async (req, res) => {
  try {
    const parsedLimit = req.query.limit ? Number(req.query.limit) : null
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : null
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0

    const filters = {
      era: req.query.era || null,
      language: req.query.language || null,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : null,
      limit,
      offset
    }

    const auctions = await fetchAuctionsFromDatabase(filters)
    return res.json(auctions)
  } catch (error) {
    console.error('Failed to fetch auctions', error)
    return res.status(500).json({ error: 'Failed to load auctions' })
  }
})

// Optional debug endpoint
app.get('/api/cards', async (req, res) => {
  try {
    const expansionIdParam = typeof req.query.expansionId === 'string' ? Number(req.query.expansionId) : null
    const expansionId = Number.isFinite(expansionIdParam) ? expansionIdParam : null
    const setCode = expansionId ? null : typeof req.query.set === 'string' ? req.query.set : null
    const search = typeof req.query.search === 'string' ? req.query.search : typeof req.query.q === 'string' ? req.query.q : null
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 100
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0

    if (await ensurePriceTrackerImportTablesAvailable()) {
      const cards = await fetchCardsListFromPtImport({ setCode, search, limit, offset })
      return res.json(cards)
    }

    if (PRICE_TRACKER_API_KEY) {
      const cards = await fetchCardsListFromPriceTracker({ setCode, search, limit, offset })
      return res.json(cards)
    }

    const cards = await fetchCardsListFromDatabase({ setCode, expansionId })
    return res.json(cards)
  } catch (error) {
    console.error('Failed to fetch cards', error)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

/**
 * ✅ Canonical route used by the frontend:
 * GET /api/expansions/:setCode/cards
 */
app.get('/api/expansions/:setCode/cards', async (req, res) => {
  try {
    const setCode = String(req.params.setCode || '').trim()
    if (!setCode) return res.status(400).json({ error: 'Invalid set code' })

    if (await ensurePriceTrackerImportTablesAvailable()) {
      const cards = await fetchCardsListFromPtImport({ setCode })
      return res.json(cards)
    }

    if (PRICE_TRACKER_API_KEY) {
      const cards = await fetchCardsListFromPriceTracker({ setCode })
      return res.json(cards)
    }

    const cards = await fetchCardsListFromDatabase({ setCode })
    return res.json(cards)
  } catch (error) {
    console.error('Failed to fetch cards for expansion', error)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

/**
 * Optional alias:
 * GET /api/expansions/id/:id/cards
 */
app.get('/api/expansions/id/:id/cards', async (req, res) => {
  try {
    const expansionId = Number(req.params.id)
    if (!Number.isFinite(expansionId)) return res.status(400).json({ error: 'Invalid expansion id' })

    if (PRICE_TRACKER_API_KEY) {
      try {
        const expansion = await fetchExpansionById(expansionId)
        if (!expansion) return res.json([])
        const cards = await fetchCardsListFromPriceTracker({
          setCode: expansion.set_code ?? expansion.set_name ?? String(expansionId)
        })
        return res.json(cards)
      } catch (error) {
        console.error('Failed to fetch cards from Price Tracker', error)
      }
    }

    if (await ensurePriceTrackerImportTablesAvailable()) {
      const expansion = await fetchExpansionById(expansionId)
      if (!expansion) return res.json([])
      const cards = await fetchCardsListFromPtImport({
        setCode: expansion.set_code ?? expansion.set_name ?? String(expansionId)
      })
      return res.json(cards)
    }

    const cards = await fetchCardsListFromDatabase({ expansionId })
    return res.json(cards)
  } catch (error) {
    console.error('Failed to fetch cards for expansion id', error)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

app.get('/api/cards/search', async (req, res) => {
  try {
    const query = String(req.query.q ?? '').trim()
    if (!query) return res.json([])

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const source = String(req.query.source ?? '').trim()

    if (source === 'database' || !PRICE_TRACKER_API_KEY) {
      const ptReady = await ensurePriceTrackerImportTablesAvailable()
      const results = ptReady
        ? await fetchCardSearchFromPtImport(query, limit)
        : await fetchCardSearchFromDatabase(query, limit)
      return res.json(results)
    }

    const ptReady = await ensurePriceTrackerImportTablesAvailable()
    if (ptReady) {
      const results = await fetchCardSearchFromPtImport(query, limit)
      return res.json(results)
    }

    const results = await fetchCardSearchFromPriceTracker(query, limit)
    return res.json(results)
  } catch (error) {
    console.error('Failed to search cards', error)
    return res.status(500).json({ error: 'Failed to search cards' })
  }
})

app.get('/api/cards/:id', async (req, res) => {
  try {
    const cardIdParam = String(req.params.id ?? '').trim()
    if (!cardIdParam) return res.status(400).json({ error: 'Invalid card id' })
    const cardId = Number(cardIdParam)

    let card = null

    if (Number.isFinite(cardId)) {
      card = await fetchCardFromDatabase(cardId)
    }

    if (!card && (await ensurePriceTrackerImportTablesAvailable())) {
      card = await fetchCardFromPtImport(cardIdParam)
    }

    if (!card && PRICE_TRACKER_API_KEY && Number.isFinite(cardId)) {
      try {
        card = await fetchCardFromPriceTracker(cardId)
      } catch (error) {
        console.error('Failed to fetch card from Price Tracker', error)
      }
    }

    if (!card) return res.status(404).json({ error: 'Card not found' })

    return res.json(card)
  } catch (error) {
    console.error('Failed to fetch card', error)
    return res.status(500).json({ error: 'Failed to load card' })
  }
})

app.get('/api/cards/:id/auctions', async (req, res) => {
  try {
    const cardId = Number(req.params.id)
    if (!Number.isFinite(cardId)) return res.json([])

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
    return res.json({ source: 'database', count: auctions.length, auctions })
  } catch (error) {
    res.status(500).json({ source: 'database', error: error?.message || String(error) })
  }
})

// --------------------
// Linking
// --------------------
app.get('/api/linking/links', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const [linksReady, auctionsReady, cardsReady] = await Promise.all([
      ensureTraderaAuctionLinksTableAvailable(),
      ensureTraderaAuctionsTableAvailable(),
      ensureCardInfrastructure()
    ])
    if (!linksReady || !auctionsReady || !cardsReady) {
      return res.status(500).json({ error: 'Required tables unavailable' })
    }

    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : null
    const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
    const safeLimit = hasLimit ? Math.min(Math.max(limit, 1), 2000) : null
    const limitClause = safeLimit ? 'LIMIT $1' : ''
    const params = safeLimit ? [safeLimit] : []
    const { rows } = await pool.query(
      `
        SELECT
          l.auction_id,
          l.card_id,
          l.method,
          l.confidence,
          l.created_at,
          a.title AS auction_title,
          a.item_url AS auction_url,
          a.end_date AS auction_end_date,
          a.price AS auction_price,
          a.bid_count AS auction_bid_count,
          a.seller_alias AS auction_seller_alias,
          c.name AS card_name,
          c.collector_number_raw AS card_number,
          e.set_name AS set_name,
          e.set_code AS set_code
        FROM public.tradera_auction_card_links l
        LEFT JOIN public.tradera_auctions a ON a.item_id = l.auction_id
        LEFT JOIN public.cards c ON c.id = l.card_id
        LEFT JOIN public.expansions e ON e.id = c.expansion_id
        ORDER BY l.created_at DESC NULLS LAST
        ${limitClause}
      `,
      params
    )

    res.json(
      rows.map((row) => ({
        itemId: row.auction_id,
        cardId: row.card_id,
        method: row.method ?? null,
        confidence: row.confidence ?? null,
        linkedAt: row.created_at ?? null,
        auctionTitle: row.auction_title ?? null,
        auctionUrl: row.auction_url ?? null,
        auctionEndDate: row.auction_end_date ?? null,
        auctionPrice: row.auction_price ?? null,
        auctionBidCount: row.auction_bid_count ?? null,
        auctionSellerAlias: row.auction_seller_alias ?? null,
        cardName: row.card_name ?? null,
        cardNumber: row.card_number ?? null,
        setName: row.set_name ?? null,
        setCode: row.set_code ?? null
      }))
    )
  } catch (error) {
    console.error('Failed to fetch auction card links', error)
    res.status(500).json({ error: 'Failed to load auction card links' })
  }
})

app.get('/api/linking/stats', async (_req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const [linksReady, auctionsReady] = await Promise.all([
      ensureTraderaAuctionLinksTableAvailable(),
      ensureTraderaAuctionsTableAvailable()
    ])
    if (!linksReady || !auctionsReady) {
      return res.status(500).json({ error: 'Required tables unavailable' })
    }

    const {
      rows: [counts]
    } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(l.auction_id)::int AS linked,
        (COUNT(*) - COUNT(l.auction_id))::int AS unlinked
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_card_links l ON l.auction_id = a.item_id
    `)

    const {
      rows: [latest]
    } = await pool.query(`
      SELECT MAX(created_at) AS last_linked_at
      FROM public.tradera_auction_card_links
    `)

    res.json({
      total: counts?.total ?? 0,
      linked: counts?.linked ?? 0,
      unlinked: counts?.unlinked ?? 0,
      lastLinkedAt: latest?.last_linked_at ?? null
    })
  } catch (error) {
    console.error('Failed to fetch linking stats', error)
    res.status(500).json({ error: 'Failed to load linking stats' })
  }
})

app.post('/api/linking/run', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const limit = Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : null
    const result = await runDeterministicLinker({ limit })
    res.json(result)
  } catch (error) {
    console.error('Failed to run deterministic linker', error)
    res.status(500).json({ error: 'Failed to run linker' })
  }
})

app.post('/api/linking/parse', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const limit = Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : null
    const result = await runAuctionTitleParser({ limit })
    res.json(result)
  } catch (error) {
    console.error('Failed to run auction title parser', error)
    res.status(500).json({ error: 'Failed to run parser' })
  }
})

app.post('/api/linking/manual', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const auctionId = Number(req.body?.auctionId)
    const cardId = Number(req.body?.cardId)

    if (!Number.isFinite(auctionId) || !Number.isFinite(cardId)) {
      return res.status(400).json({ error: 'Invalid auction or card id' })
    }

    const [linksReady, auctionsReady, cardsReady] = await Promise.all([
      ensureTraderaAuctionLinksTableAvailable(),
      ensureTraderaAuctionsTableAvailable(),
      ensureCardInfrastructure()
    ])

    if (!linksReady || !auctionsReady || !cardsReady) {
      return res.status(500).json({ error: 'Required tables unavailable' })
    }

    const {
      rows: [auction]
    } = await pool.query('SELECT item_id FROM public.tradera_auctions WHERE item_id = $1', [auctionId])
    if (!auction) return res.status(404).json({ error: 'Auction not found' })

    const {
      rows: [card]
    } = await pool.query('SELECT id FROM public.cards WHERE id = $1', [cardId])
    if (!card) return res.status(404).json({ error: 'Card not found' })

    await pool.query(
      `
        INSERT INTO public.tradera_auction_card_links (auction_id, card_id, method, confidence, created_at)
        VALUES ($1, $2, 'manual', 1.0, NOW())
        ON CONFLICT (auction_id)
        DO UPDATE SET
          card_id = EXCLUDED.card_id,
          method = 'manual',
          confidence = 1.0,
          created_at = NOW()
      `,
      [auctionId, cardId]
    )

    return res.json({ ok: true })
  } catch (error) {
    console.error('Failed to manually link auction', error)
    return res.status(500).json({ error: 'Failed to link auction' })
  }
})

app.get('/api/linking/unlinked', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : null
    const auctions = await fetchUnlinkedAuctionSummaries(limit)
    res.json(
      auctions.map((row) => ({
        itemId: row.item_id,
        title: row.title ?? null,
        description: row.description ?? null,
        endDate: row.end_date ?? null,
        price: row.price ?? null,
        bidCount: row.bid_count ?? null,
        itemUrl: row.item_url ?? null,
        sellerAlias: row.seller_alias ?? null,
        pokemonEra: row.pokemon_era ?? null,
        pokemonLanguage: row.pokemon_language ?? null,
        itemCondition: row.item_condition ?? null,
        detectedCollectorNumber: row.detected_collector_number ?? null,
        detectedExpansionName: row.detected_expansion_name ?? null,
        detectedExpansionCode: row.detected_expansion_code ?? null
      }))
    )
  } catch (error) {
    console.error('Failed to fetch unlinked auctions', error)
    res.status(500).json({ error: 'Failed to load unlinked auctions' })
  }
})

// --------------------
// Import runs
// --------------------
app.get('/api/import/runs', async (req, res) => {
  if (!pool) return res.json([])

  try {
    const ok = await ensureImportRunsTable()
    if (!ok) return res.status(500).json({ error: 'import_runs table unavailable' })

    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100)
    const { rows } = await pool.query(
      `
        SELECT
          id,
          source,
          started_at,
          finished_at,
          status,
          new_rows,
          pages_fetched,
          requests_used,
          message,
          run_uuid,
          LEFT(error_stack, 500) AS error_stack_preview
        FROM public.import_runs
        ORDER BY started_at DESC
        LIMIT $1
      `,
      [limit]
    )

    res.json(rows)
  } catch (error) {
    console.error('Failed to fetch import runs', error)
    res.status(500).json({ error: 'Failed to load import runs' })
  }
})

app.get('/api/import/runs/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

  try {
    const ok = await ensureImportRunsTable()
    if (!ok) return res.status(500).json({ error: 'import_runs table unavailable' })

    const runId = Number(req.params.id)
    if (!Number.isFinite(runId)) return res.status(400).json({ error: 'Invalid run id' })

    const { rows } = await pool.query(
      `
        SELECT id, source, started_at, finished_at, status, new_rows, pages_fetched, requests_used, message, run_uuid, error_stack
        FROM public.import_runs
        WHERE id = $1
      `,
      [runId]
    )

    if (!rows.length) return res.status(404).json({ error: 'Not found' })

    res.json(rows[0])
  } catch (error) {
    console.error('Failed to fetch import run', error)
    res.status(500).json({ error: 'Failed to load import run' })
  }
})

app.post('/api/import/run', async (_req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  try {
    const salesAvailable = await ensureTraderaAuctionsTableAvailable()
    const runsAvailable = await ensureImportRunsTable()
    if (!salesAvailable || !runsAvailable) {
      return res.status(500).json({ ok: false, error: 'Required tables unavailable' })
    }

    const startTime = Date.now()
    const runUuid = crypto.randomUUID()

    const {
      rows: [before]
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated FROM public.tradera_auctions')

    const { code, stdout, stderr } = await runImporterScript(runUuid)
    const durationMs = Date.now() - startTime

    const {
      rows: [after]
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated FROM public.tradera_auctions')

    const newRows = after.count - before.count
    const output = `${stdout}${stderr}`.trim()
    const errorMessage = code === 0 ? null : extractImporterError(stdout, stderr) || `Importer exited with code ${code}`

    const payload = {
      ok: code === 0,
      exitCode: code,
      newRows,
      durationMs,
      startedAt: new Date(startTime).toISOString(),
      lastFetchedAt: after.last_updated,
      output,
      runUuid
    }

    if (code !== 0) {
      console.error('Importer failed', { exitCode: code, error: errorMessage, stderr })
      return res.status(500).json({ ...payload, error: errorMessage })
    }
    return res.json(payload)
  } catch (error) {
    console.error('Failed to run importer', error)
    return res.status(500).json({ ok: false, error: String(error) })
  }
})

// Bootstrap seed
if (pool) {
  ensureCardInfrastructure().catch((error) => {
    console.error('Failed to bootstrap Pokémon catalog', error)
  })
}

// --------------------
// Frontend
// --------------------
const hasDashboardBuild = ensureDashboardBuild()
if (!hasDashboardBuild) {
  console.warn('Dashboard build unavailable; frontend responses will show an error until a build succeeds')
}

if (hasDashboardBuild) {
  app.use(express.static(distPath))

  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  app.get('*', (_req, res) => {
    res.status(503).send('Dashboard build missing. Run `npm run build --prefix dashboard` and redeploy the app.')
  })
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

module.exports = { app, pool, ensureCardInfrastructure }
