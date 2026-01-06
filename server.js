// server.js
const express = require('express')
const compression = require('compression')
const path = require('path')
const { existsSync } = require('fs')
const { spawn, spawnSync } = require('child_process')
const { Pool } = require('pg')
const crypto = require('crypto')
const mockAuctions = require('./server/mock-auctions.json')
const { createExpansionService } = require('./server/routes/expansions')

const { loadCatalog } = require('./server/catalog/catalogLoader')
const { seedCatalog } = require('./server/catalog/catalogSeeder')

const { runStage: runEnrichmentStage, runFullPipeline } = require('./server/enrichment/enrichmentJob')

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
// Static catalog cache
// --------------------
let cachedCatalogPromise = null
let cachedStaticCardsIndex = null

async function getStaticCatalog() {
  if (!cachedCatalogPromise) {
    cachedCatalogPromise = loadCatalog()
  }
  return cachedCatalogPromise
}

function computeStaticCardId(setCode, cardNumber, fallbackSeed = '') {
  const normalizedSetCode = String(setCode || '').trim().toUpperCase() || 'UNKNOWN'
  const normalizedCardNumber = String(cardNumber || fallbackSeed || '0')

  // Use a deterministic hash to ensure stable IDs across requests and deployments
  const hash = crypto
    .createHash('md5')
    .update(`${normalizedSetCode}::${normalizedCardNumber}`)
    .digest('hex')
    .slice(0, 12)

  return Number.parseInt(hash, 16)
}

async function getStaticCardsForSet(setCode) {
  const code = String(setCode || '').trim()
  if (!code) return []

  const normalized = code.toLowerCase()
  const { expansions, cardsBySetCode } = await getStaticCatalog()

  const expansion = expansions.find((expansion) => expansion.set_code?.toLowerCase() === normalized) ?? null
  const cardsEntry =
    Object.entries(cardsBySetCode || {}).find(([key]) => key.toLowerCase() === normalized)?.[1] ?? null

  if (!cardsEntry?.cards?.length) return []

  const setTotal =
    cardsEntry.set_total ?? expansion?.set_number ?? expansion?.set_total ?? null

  return cardsEntry.cards.map((card, index) => {
    const setCodeValue = cardsEntry.set_code ?? expansion?.set_code ?? code
    const stableId = Number.isFinite(card.id)
      ? card.id
      : computeStaticCardId(setCodeValue, card.card_number, `${index}`)

    return applyCardOverrides({
      id: stableId,
      name: card.name ?? 'Unknown card',
      era: expansion?.era ?? null,
      set_name: expansion?.name ?? cardsEntry.set_name ?? null,
      set_code: setCodeValue,
      set_total: card.set_total ?? setTotal ?? null,
      card_number: card.card_number ?? null,
      image_url: card.image_url ?? null,
      product_details: card.product_details ?? null,
      expansion_id: null,
      created_at: new Date(0).toISOString(),
      linked_auctions: 0,
      last_seen: null
    })
  })
}

async function getStaticCardsIndex() {
  if (cachedStaticCardsIndex) return cachedStaticCardsIndex

  const { expansions } = await getStaticCatalog()
  const index = new Map()

  for (const expansion of expansions || []) {
    const cards = await getStaticCardsForSet(expansion.set_code)
    for (const card of cards) {
      index.set(card.id, card)
    }
  }

  cachedStaticCardsIndex = index
  return index
}

async function getStaticCardById(cardId) {
  const index = await getStaticCardsIndex()
  return index.get(cardId) || null
}

async function getStaticExpansionSummaries() {
  const { expansions, cardsBySetCode } = await getStaticCatalog()

  return expansions.map((expansion, index) => ({
    id: index + 1,
    set_code: expansion.set_code,
    name: expansion.name ?? null,
    era: expansion.era ?? null,
    language: expansion.language ?? null,
    set_number: expansion.set_number ?? null,
    cards_in_set: expansion.cards_in_set ?? null,
    set_total:
      expansion.set_number ??
      expansion.set_total ??
      cardsBySetCode?.[expansion.set_code]?.set_total ??
      null,
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

const { registerRoutes: registerExpansionRoutes } = createExpansionService({
  pool,
  ensureCardInfrastructure,
  getStaticExpansionSummaries
})

let hasCheckedSalesTable = false
let salesTableAvailable = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasCheckedExpansionsTable = false
let expansionsTableAvailable = false
let hasCheckedSalesCardColumn = false
let salesCardColumnAvailable = false
let hasCheckedSalesParsedSetCodeColumn = false
let salesParsedSetCodeColumnAvailable = false
let hasEnsuredSalesCardIndex = false
let hasEnsuredEnrichmentColumns = false
let hasEnsuredEnrichmentIndexes = false
let hasSeededStaticCatalog = false
let hasCheckedEnrichmentTable = false
let enrichmentTableAvailable = false
let seedingCatalogPromise = null
let hasCheckedImportRunsTable = false
let importRunsTableAvailable = false
let ensureCardInfrastructurePromise = null

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
    importRunsTableAvailable = Boolean(
      startIndexReady && runUuidColumnReady && errorStackColumnReady && runUuidIndexReady
    )
  } catch (error) {
    console.error('Failed to ensure import_runs table exists', error)
    importRunsTableAvailable = false
  }

  hasCheckedImportRunsTable = true
  return importRunsTableAvailable
}

async function ensureSalesTableAvailable() {
  if (!pool) return false
  if (hasCheckedSalesTable) return salesTableAvailable

  const { rows } = await pool.query(
    "SELECT to_regclass('public.auctions') AS auctions, to_regclass('public.tradera_sales') AS sales_view"
  )
  salesTableAvailable = Boolean(rows?.[0]?.auctions)
  if (!rows?.[0]?.sales_view) {
    console.warn('tradera_sales view does not exist; legacy reads may fail')
  }
  hasCheckedSalesTable = true

  if (!salesTableAvailable) console.warn('auctions table does not exist')
  return salesTableAvailable
}

async function ensureEnrichmentTableAvailable() {
  if (!pool) return false
  if (hasCheckedEnrichmentTable) return enrichmentTableAvailable

  const { rows } = await pool.query("SELECT to_regclass('public.auction_enrichment') AS table_name")
  enrichmentTableAvailable = Boolean(rows?.[0]?.table_name)
  hasCheckedEnrichmentTable = true

  if (!enrichmentTableAvailable) console.warn('auction_enrichment table does not exist')
  return enrichmentTableAvailable
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
        name TEXT,
        era TEXT,
        language TEXT DEFAULT 'EN',
        set_total INTEGER,
        release_date DATE,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const hasImageUrl = await ensureColumnExists('expansions', 'image_url', 'TEXT')
    const hasEraIndex = await ensureIndexExists('expansions', 'idx_expansions_era', '(era)')
    expansionsTableAvailable = Boolean(hasEraIndex && hasImageUrl)
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
        name TEXT NOT NULL,
        era TEXT,
        set_name TEXT NOT NULL,
        image_url TEXT,
        product_details TEXT,
        set_code TEXT,
        set_total INTEGER,
        card_number TEXT,
        expansion_id INTEGER REFERENCES public.expansions(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cards_expansion_card_number_key UNIQUE (expansion_id, card_number)
      )
    `)

    const setCodeOk = await ensureColumnExists('cards', 'set_code', 'TEXT')
    const setTotalOk = await ensureColumnExists('cards', 'set_total', 'INTEGER')
    const expansionOk = await ensureColumnExists('cards', 'expansion_id', 'INTEGER REFERENCES public.expansions(id)')
    const imageUrlOk = await ensureColumnExists('cards', 'image_url', 'TEXT')
    const productDetailsOk = await ensureColumnExists('cards', 'product_details', 'TEXT')
    const cardNumberOk = await ensureColumnExists('cards', 'card_number', 'TEXT')

    const removedNameSetConstraint = await dropConstraintIfExists('cards', 'cards_unique_name_set')

    const uniqueByExpansionNumber = await ensureConstraintExists(
      'cards',
      'cards_expansion_card_number_key',
      'UNIQUE (expansion_id, card_number)'
    )

    const setCodeIdx = await ensureIndexExists('cards', 'idx_cards_set_code', '(set_code)')
    const numberIdx = await ensureIndexExists('cards', 'idx_cards_card_number', '(card_number)')

    cardsTableAvailable = Boolean(
      setCodeOk &&
        setTotalOk &&
        expansionOk &&
        imageUrlOk &&
        productDetailsOk &&
        cardNumberOk &&
        removedNameSetConstraint &&
        uniqueByExpansionNumber &&
        setCodeIdx &&
        numberIdx
    )
  } catch (error) {
    console.error('Failed to ensure cards table exists', error)
    cardsTableAvailable = false
  }

  hasCheckedCardsTable = true
  return cardsTableAvailable
}

async function ensureCardInfrastructure() {
  if (!pool) return false
  if (ensureCardInfrastructurePromise) return ensureCardInfrastructurePromise

  ensureCardInfrastructurePromise = (async () => {
    try {
      const [salesReady, expansionsReady, cardsReady] = await Promise.all([
        ensureSalesTableAvailable(),
        ensureExpansionsTableAvailable(),
        ensureCardsTableAvailable()
      ])

      if (!salesReady || !expansionsReady || !cardsReady) return false

      if (salesReady) {
        if (!hasCheckedSalesCardColumn) {
          try {
            salesCardColumnAvailable = await ensureColumnExists(
              'auctions',
              'card_id',
              'INTEGER REFERENCES public.cards(id)'
            )
          } catch (error) {
            console.error('Failed to ensure auctions.card_id column exists', error)
            salesCardColumnAvailable = false
          }
          hasCheckedSalesCardColumn = true
        }

        if (!hasCheckedSalesParsedSetCodeColumn) {
          try {
            salesParsedSetCodeColumnAvailable = await ensureColumnExists('auctions', 'parsed_set_code', 'TEXT')
          } catch (error) {
            console.error('Failed to ensure auctions.parsed_set_code column exists', error)
            salesParsedSetCodeColumnAvailable = false
          }
          hasCheckedSalesParsedSetCodeColumn = true
        }

        if (salesCardColumnAvailable && !hasEnsuredSalesCardIndex) {
          try {
            hasEnsuredSalesCardIndex = await ensureIndexExists('auctions', 'idx_auctions_card_id', '(card_id)')
          } catch (error) {
            console.error('Failed to ensure auctions.card_id index exists', error)
            hasEnsuredSalesCardIndex = false
          }
        }
      }

      const enrichmentReady = await ensureEnrichmentTableAvailable()

      if (enrichmentReady && !hasEnsuredEnrichmentColumns) {
        const columnResults = await Promise.all([
          ensureColumnExists('auction_enrichment', 'status', 'TEXT'),
          ensureColumnExists('auction_enrichment', 'matched_era', 'TEXT'),
          ensureColumnExists('auction_enrichment', 'matched_set_code', 'TEXT'),
          ensureColumnExists('auction_enrichment', 'parsed_card_number', 'TEXT'),
          ensureColumnExists('auction_enrichment', 'parsed_card_name', 'TEXT')
        ])

        hasEnsuredEnrichmentColumns = columnResults.every(Boolean)
      }

      if (enrichmentReady && !hasEnsuredEnrichmentIndexes) {
        const indexResults = await Promise.all([
          ensureIndexExists('auction_enrichment', 'idx_auction_enrichment_status', '(status)'),
          ensureIndexExists('auction_enrichment', 'idx_auction_enrichment_matched', '(matched_era, matched_set_code)'),
          ensureIndexExists('auction_enrichment', 'idx_auction_enrichment_parsed_card_number', '(parsed_card_number)')
        ])

        hasEnsuredEnrichmentIndexes = indexResults.every(Boolean)
      }

      return true
    } catch (error) {
      console.error('Failed to ensure card infrastructure', error)
      return false
    }
  })()

  return ensureCardInfrastructurePromise
}

async function fetchAuctionsFromDatabase(filters = {}) {
  if (!pool) return []
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

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

  let query = `
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
      COALESCE(e.era, c.era) AS card_era,
      COALESCE(e.name, c.set_name) AS card_set_name,
      COALESCE(e.set_code, c.set_code) AS card_set_code,
      c.card_number AS card_number,
      ts.attributes->'pokemon_era'->>0 AS pokemon_era,
      ts.attributes->'pokemon_language'->>0 AS pokemon_language,
      ts.attributes->'pokemon_grading_issuer'->>0 AS grading_issuer,
      ts.attributes->'pokemon_grade'->>0 AS grading_grade
    FROM public.tradera_sales ts
    LEFT JOIN public.cards c ON c.id = ts.card_id
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
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

function filterMockAuctions(filters = {}) {
  const { era = null, language = null, gradingIssuer = null, grade = null, minPrice = null, maxPrice = null } = filters

  const matchesFilter = (value, expected) => {
    if (!expected) return true
    const normalizedValue = String(value || '').toLowerCase()
    return normalizedValue === String(expected).toLowerCase()
  }

  return mockAuctions.filter((auction) => {
    const matchesEra = !era || matchesFilter(auction.cardEra, era)
    const matchesLanguage = !language || matchesFilter(auction.language, language)
    const matchesGradingIssuer = !gradingIssuer || matchesFilter(auction.gradingCompany, gradingIssuer)
    const matchesGrade = !grade || matchesFilter(auction.grade, grade)
    const matchesMinPrice = !minPrice || (auction.finalPrice ?? 0) >= Number(minPrice)
    const matchesMaxPrice = !maxPrice || (auction.finalPrice ?? 0) <= Number(maxPrice)

    return matchesEra && matchesLanguage && matchesGradingIssuer && matchesGrade && matchesMinPrice && matchesMaxPrice
  })
}

async function fetchCard(cardId) {
  if (!Number.isFinite(cardId)) return null
  if (!pool) return getStaticCardById(cardId)

  const ok = await ensureCardInfrastructure()
  if (!ok) return getStaticCardById(cardId)

  const query = `
    SELECT
      c.id,
      c.name,
      COALESCE(e.era, c.era) AS era,
      COALESCE(e.name, c.set_name) AS set_name,
      COALESCE(e.set_code, c.set_code) AS set_code,
      COALESCE(e.set_total, c.set_total) AS set_total,
      c.card_number,
      c.image_url,
      c.product_details,
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
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

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
      COALESCE(e.era, c.era) AS card_era,
      COALESCE(e.name, c.set_name) AS card_set_name,
      COALESCE(e.set_code, c.set_code) AS card_set_code,
      c.card_number AS card_number
    FROM public.tradera_sales ts
    JOIN public.cards c ON c.id = ts.card_id
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
    WHERE ts.card_id = $1
    ORDER BY ts.end_date DESC
    LIMIT $2
  `
  const result = await pool.query(query, [cardId, limit])
  return result.rows.map(normalizeAuctionRow)
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

async function fetchCardsList({ setCode = null, expansionId = null } = {}) {
  if (!pool) return getStaticCardsForSet(setCode)
  const ok = await ensureCardInfrastructure()
  if (!ok) return getStaticCardsForSet(setCode)

  let whereClause = ''
  const params = []

  if (Number.isFinite(expansionId)) {
    whereClause = 'WHERE c.expansion_id = $1'
    params.push(Number(expansionId))
  } else if (setCode) {
    whereClause = `
      WHERE LOWER(COALESCE(e.set_code, c.set_code)) = LOWER($1)
         OR LOWER(COALESCE(e.name, c.set_name)) = LOWER($1)
    `
    params.push(setCode.trim())
  }

  const query = `
    SELECT
      c.id,
      c.name,
      COALESCE(e.era, c.era) AS era,
      COALESCE(e.name, c.set_name) AS set_name,
      COALESCE(e.set_code, c.set_code) AS set_code,
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
  const dbCards = result.rows.map(applyCardOverrides)

  // If the database has no cards for this set, fall back to the static catalog so
  // set pages still render cards instead of an empty list.
  if (dbCards.length === 0 && setCode) {
    const staticCards = await getStaticCardsForSet(setCode)
    if (staticCards.length) return staticCards
  }

  return dbCards
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

app.get('/api/sales', async (req, res) => {
  try {
    const parsedLimit = req.query.limit ? Number(req.query.limit) : null
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : null
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0

    const filters = {
      era: req.query.era || null,
      language: req.query.language || null,
      gradingIssuer: req.query.gradingIssuer || null,
      grade: req.query.grade || null,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : null,
      limit,
      offset
    }

    const auctions = await fetchAuctionsFromDatabase(filters)

    if (auctions.length) {
      return res.json(auctions)
    }

    const fallback = filterMockAuctions(filters)
    console.warn('Serving mock auctions because database rows were unavailable')
    return res.json(fallback)
  } catch (error) {
    console.error('Failed to fetch auctions', error)
    const fallback = filterMockAuctions({
      era: req.query.era || null,
      language: req.query.language || null,
      gradingIssuer: req.query.gradingIssuer || null,
      grade: req.query.grade || null,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : null
    })

    if (fallback.length) {
      console.warn('Falling back to mock auctions due to error while fetching from database')
      return res.json(fallback)
    }

    return res.status(500).json({ error: 'Failed to load auctions' })
  }
})

// Optional debug endpoint
app.get('/api/cards', async (req, res) => {
  try {
    const expansionIdParam = typeof req.query.expansionId === 'string' ? Number(req.query.expansionId) : null
    const expansionId = Number.isFinite(expansionIdParam) ? expansionIdParam : null
    const setCode = expansionId ? null : typeof req.query.set === 'string' ? req.query.set : null

    const cards = await fetchCardsList({ setCode, expansionId })
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

    const cards = await fetchCardsList({ setCode })
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

    const cards = await fetchCardsList({ expansionId })
    return res.json(cards)
  } catch (error) {
    console.error('Failed to fetch cards for expansion id', error)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

app.get('/api/cards/:id', async (req, res) => {
  try {
    const cardId = Number(req.params.id)
    if (!Number.isFinite(cardId)) return res.status(400).json({ error: 'Invalid card id' })

    const card = await fetchCard(cardId)
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
    if (!Number.isFinite(cardId)) return res.status(400).json({ error: 'Invalid card id' })

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
    if (auctions.length) {
      return res.json({ source: 'database', count: auctions.length, auctions })
    }
    return res.json({ source: 'mock', count: mockAuctions.length, auctions: mockAuctions })
  } catch (error) {
    res.status(500).json({ source: 'database', error: error?.message || String(error) })
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
    const salesAvailable = await ensureSalesTableAvailable()
    const runsAvailable = await ensureImportRunsTable()
    if (!salesAvailable || !runsAvailable)
      return res.status(500).json({ ok: false, error: 'Required tables unavailable' })

    const startTime = Date.now()
    const runUuid = crypto.randomUUID()

    const {
      rows: [before]
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(fetched_at) AS last_fetched FROM public.auctions')

    const { code, stdout, stderr } = await runImporterScript(runUuid)
    const durationMs = Date.now() - startTime

    const {
      rows: [after]
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(fetched_at) AS last_fetched FROM public.auctions')

    const newRows = after.count - before.count
    const output = `${stdout}${stderr}`.trim()
    const errorMessage = code === 0 ? null : extractImporterError(stdout, stderr) || `Importer exited with code ${code}`

    const payload = {
      ok: code === 0,
      exitCode: code,
      newRows,
      durationMs,
      startedAt: new Date(startTime).toISOString(),
      lastFetchedAt: after.last_fetched,
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

// --------------------
// Enrichment
// --------------------
async function runEnrichmentJob({ stage = 'era', limit = 100 } = {}) {
  return runEnrichmentStage(pool, stage, limit)
}

const STAGE_QUEUE_WHERE = {
  era: "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NULL",
  set: "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NOT NULL AND e.matched_set_code IS NULL",
  number:
    "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_set_code IS NOT NULL AND e.parsed_card_number IS NULL",
  name:
    "a.card_id IS NULL AND e.status <> 'discarded' AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NULL",
  ready_to_link:
    "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NOT NULL AND e.matched_set_code IS NOT NULL " +
    "AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NOT NULL"
}

async function loadQueue(stage, limit = 100) {
  const where = STAGE_QUEUE_WHERE[stage]
  if (!where) return []

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const { rows } = await pool.query(
    `
      SELECT a.*, e.*
      FROM public.auctions a
      JOIN public.auction_enrichment e ON e.item_id = a.item_id
      WHERE ${where}
      ORDER BY a.end_date DESC
      LIMIT $1
    `,
    [safeLimit]
  )

  return rows
}

app.post('/api/enrichment/run', async (req, res) => {
  try {
    const payload = await runEnrichmentJob({ stage: req.body?.stage || 'era', limit: req.body?.limit })
    res.json(payload)
  } catch (error) {
    console.error('Failed to run enrichment matcher', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.post('/api/enrichment/run-all', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })
  try {
    const limitPerStage = Math.min(Math.max(Number(req.body?.limitPerStage) || 100, 1), 1000)
    const payload = await runFullPipeline(pool, limitPerStage)
    res.json(payload)
  } catch (error) {
    console.error('Failed to run full enrichment pipeline', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.get('/api/enrichment/queue', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })
  try {
    const stage = req.query.stage || 'era'
    const limit = req.query.limit || 100
    const rows = await loadQueue(stage, limit)
    res.json({ stage, rows })
  } catch (error) {
    console.error('Failed to load enrichment queue', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.get('/api/enrichment/audit', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })
  try {
    const itemId = Number(req.query.itemId)
    if (!Number.isFinite(itemId)) return res.status(400).json({ ok: false, error: 'Invalid itemId' })

    const { rows: auctionsRows } = await pool.query('SELECT * FROM public.auctions WHERE item_id = $1 LIMIT 1', [itemId])
    const { rows: enrichmentRows } = await pool.query(
      'SELECT * FROM public.auction_enrichment WHERE item_id = $1 LIMIT 1',
      [itemId]
    )

    if (!auctionsRows.length) return res.status(404).json({ ok: false, error: 'Auction not found' })

    res.json({ auction: auctionsRows[0], enrichment: enrichmentRows[0] || null })
  } catch (error) {
    console.error('Failed to load enrichment audit row', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.get('/api/enrichment/stats', async (_req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  try {
    const { rows: funnelRows } = await pool.query(
      `
        SELECT
          SUM(CASE WHEN a.card_id IS NULL AND e.matched_era IS NULL THEN 1 ELSE 0 END) AS era_missing,
          SUM(CASE WHEN a.card_id IS NULL AND e.matched_era IS NOT NULL AND e.matched_set_code IS NULL THEN 1 ELSE 0 END) AS set_missing,
          SUM(CASE WHEN a.card_id IS NULL AND e.matched_set_code IS NOT NULL AND e.parsed_card_number IS NULL THEN 1 ELSE 0 END) AS number_missing,
          SUM(CASE WHEN a.card_id IS NULL AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NULL THEN 1 ELSE 0 END) AS name_missing,
          SUM(CASE WHEN a.card_id IS NULL AND e.matched_era IS NOT NULL AND e.matched_set_code IS NOT NULL AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NOT NULL THEN 1 ELSE 0 END) AS ready_to_link,
          SUM(CASE WHEN a.card_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_total,
          SUM(CASE WHEN a.card_id IS NULL THEN 1 ELSE 0 END) AS unlinked_total
        FROM public.auctions a
        LEFT JOIN public.auction_enrichment e ON e.item_id = a.item_id
      `
    )

    const funnel = funnelRows[0] || {}

    const { rows: invariants } = await pool.query(
      `
        SELECT
          SUM(CASE WHEN a.card_id IS NOT NULL AND e.status IS NOT NULL AND e.status <> 'matched' THEN 1 ELSE 0 END) AS linked_but_not_matched_status,
          SUM(CASE WHEN a.card_id IS NOT NULL AND (e.matched_era IS NULL OR e.matched_set_code IS NULL OR e.parsed_card_number IS NULL OR e.parsed_card_name IS NULL) THEN 1 ELSE 0 END) AS linked_but_missing_fields,
          SUM(CASE WHEN a.card_id IS NULL AND e.status = 'matched' THEN 1 ELSE 0 END) AS matched_status_but_unlinked
        FROM public.auctions a
        LEFT JOIN public.auction_enrichment e ON e.item_id = a.item_id
      `
    )

    res.json({
      unlinked_total: Number(funnel.unlinked_total) || 0,
      linked_total: Number(funnel.linked_total) || 0,
      stages: {
        era_missing: Number(funnel.era_missing) || 0,
        set_missing: Number(funnel.set_missing) || 0,
        number_missing: Number(funnel.number_missing) || 0,
        name_missing: Number(funnel.name_missing) || 0,
        ready_to_link: Number(funnel.ready_to_link) || 0
      },
      invariants: {
        linked_but_not_matched_status: Number(invariants?.[0]?.linked_but_not_matched_status) || 0,
        linked_but_missing_fields: Number(invariants?.[0]?.linked_but_missing_fields) || 0,
        matched_status_but_unlinked: Number(invariants?.[0]?.matched_status_but_unlinked) || 0
      }
    })
  } catch (error) {
    console.error('Failed to load enrichment stats', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
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

module.exports = { app, pool, runEnrichmentJob, ensureCardInfrastructure }
