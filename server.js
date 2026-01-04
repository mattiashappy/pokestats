// server.js
const express = require('express')
const compression = require('compression')
const path = require('path')
const { spawn } = require('child_process')
const { Pool } = require('pg')
const crypto = require('crypto')
const mockAuctions = require('./server/mock-auctions.json')

const { loadCatalog } = require('./server/catalog/catalogLoader')
const { seedCatalog } = require('./server/catalog/catalogSeeder')

const { runEnrichmentJob: runEnrichmentJobCore } = require('./server/enrichment/enrichmentJob')

// ✅ Needed by tryAutoMatchAuction (even if currently unused elsewhere)
const {
  resolveAuctionMatch,
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

  const setTotal = cardsEntry.set_total ?? expansion?.set_total ?? null

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
let hasCheckedExpansionsTable = false
let expansionsTableAvailable = false
let hasCheckedSalesCardColumn = false
let salesCardColumnAvailable = false
let hasCheckedSalesParsedSetCodeColumn = false
let salesParsedSetCodeColumnAvailable = false
let hasBackfilledSalesCards = false
let hasEnsuredSalesCardIndex = false
let hasEnsuredEnrichmentColumns = false
let hasEnsuredEnrichmentIndexes = false
let hasSeededStaticCatalog = false
let seedingCatalogPromise = null
let hasCheckedImportRunsTable = false
let importRunsTableAvailable = false

async function findExpansionByCode(setCode) {
  if (!pool) return null
  if (!setCode) return null

  const trimmed = String(setCode || '').trim()
  if (!trimmed) return null

  const { rows } = await pool.query('SELECT id, name, era, set_code FROM public.expansions WHERE set_code = $1', [
    trimmed
  ])
  return rows[0] || null
}

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

  const { rows } = await pool.query("SELECT to_regclass('public.tradera_sales') AS table_name")
  salesTableAvailable = Boolean(rows?.[0]?.table_name)
  hasCheckedSalesTable = true

  if (!salesTableAvailable) console.warn('tradera_sales table does not exist')
  return salesTableAvailable
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

async function ensureSalesCardColumnAvailable() {
  if (!pool) return false
  if (hasCheckedSalesCardColumn) return salesCardColumnAvailable
  if (!salesTableAvailable) return false

  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name = 'tradera_sales'
        AND column_name = 'card_id'
    `
  )

  if (rows.length > 0) {
    salesCardColumnAvailable = true
    hasCheckedSalesCardColumn = true
    return true
  }

  try {
    await pool.query('ALTER TABLE public.tradera_sales ADD COLUMN card_id INTEGER REFERENCES public.cards(id)')
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
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name = 'tradera_sales'
        AND column_name = 'parsed_set_code'
    `
  )

  if (rows.length > 0) {
    salesParsedSetCodeColumnAvailable = true
    hasCheckedSalesParsedSetCodeColumn = true
    return true
  }

  try {
    await pool.query('ALTER TABLE public.tradera_sales ADD COLUMN parsed_set_code TEXT')
    salesParsedSetCodeColumnAvailable = true
  } catch (error) {
    console.error('Failed to add parsed_set_code column to tradera_sales', error)
    salesParsedSetCodeColumnAvailable = false
  }

  hasCheckedSalesParsedSetCodeColumn = true
  return salesParsedSetCodeColumnAvailable
}

async function ensureSalesEnrichmentColumnsAvailable() {
  if (!pool) return false
  if (hasEnsuredEnrichmentColumns) return hasEnsuredEnrichmentColumns
  if (!salesTableAvailable) return false

  try {
    // Hardening: add missing ERA columns even if metadata checks below fail.
    await pool.query(`
      ALTER TABLE public.tradera_sales
      ADD COLUMN IF NOT EXISTS era TEXT,
      ADD COLUMN IF NOT EXISTS pokemon_era TEXT
    `)

    // NOTE: Include any column referenced by queries/endpoints below to avoid runtime SQL errors.
    const results = await Promise.all([
      ensureColumnExists('tradera_sales', 'era', 'TEXT'),
      ensureColumnExists('tradera_sales', 'pokemon_era', 'TEXT'),
      ensureColumnExists('tradera_sales', 'match_status', 'TEXT'),
      ensureColumnExists('tradera_sales', 'match_confidence', 'TEXT'),
      ensureColumnExists('tradera_sales', 'match_method', 'TEXT'),
      ensureColumnExists('tradera_sales', 'matched_set_code', 'TEXT'),
      ensureColumnExists('tradera_sales', 'matched_era', 'TEXT'),
      ensureColumnExists('tradera_sales', 'parsed_card_number', 'TEXT'),
      ensureColumnExists('tradera_sales', 'parsed_set_total', 'INTEGER'),
      ensureColumnExists('tradera_sales', 'match_debug', 'JSONB'),
      ensureColumnExists('tradera_sales', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    ])

    hasEnsuredEnrichmentColumns = results.every(Boolean)
  } catch (error) {
    console.error('Failed to ensure enrichment columns on tradera_sales', error)
    hasEnsuredEnrichmentColumns = false
  }

  return hasEnsuredEnrichmentColumns
}

async function ensureSalesEnrichmentIndexes() {
  if (!pool) return false
  if (hasEnsuredEnrichmentIndexes) return hasEnsuredEnrichmentIndexes

  const salesAvailable = await ensureSalesTableAvailable()
  if (!salesAvailable) return false

  try {
    const results = await Promise.all([
      ensureIndexExists('tradera_sales', 'idx_tradera_sales_card_id', '(card_id)'),
      ensureIndexExists('tradera_sales', 'idx_tradera_sales_match_confidence', '(match_confidence)'),
      ensureIndexExists('tradera_sales', 'idx_tradera_sales_updated_at', '(updated_at DESC)'),
      ensureIndexExists('tradera_sales', 'idx_tradera_sales_end_date', '(end_date DESC)')
    ])

    hasEnsuredEnrichmentIndexes = results.every(Boolean)
  } catch (error) {
    console.error('Failed to ensure enrichment indexes on tradera_sales', error)
    hasEnsuredEnrichmentIndexes = false
  }

  return hasEnsuredEnrichmentIndexes
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
  const expansionsAvailable = await ensureExpansionsTableAvailable()
  const cardsAvailable = await ensureCardsTableAvailable()
  if (!salesAvailable || !cardsAvailable || !expansionsAvailable) return false

  // Critical columns needed for the read queries used by the API.
  const cardColumnAvailable = await ensureSalesCardColumnAvailable()
  const parsedSetCodeAvailable = await ensureSalesParsedSetCodeColumnAvailable()
  if (!cardColumnAvailable || !parsedSetCodeAvailable) return false

  // Best-effort helpers that improve matching performance but should not block read access.
  const optionalTasks = [
    ensureSalesCardIndexAvailable(),
    ensureSalesEnrichmentColumnsAvailable(),
    ensureSalesEnrichmentIndexes(),
    ensureStaticCatalogSeeded()
  ]

  const optionalResults = await Promise.allSettled(optionalTasks)
  const optionalFailures = optionalResults.filter((r) => r.status !== 'fulfilled')
  if (optionalFailures.length) {
    console.warn('Continuing with degraded card infrastructure; optional setup failed')
  }

  return true
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

async function ensureStaticCatalogSeeded() {
  if (!pool) return false
  if (hasSeededStaticCatalog) return true
  if (seedingCatalogPromise) return seedingCatalogPromise

  seedingCatalogPromise = (async () => {
    const expansionsReady = await ensureExpansionsTableAvailable()
    const cardsReady = await ensureCardsTableAvailable()
    if (!expansionsReady || !cardsReady) return false

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { expansions, cardsBySetCode } = await getStaticCatalog()
      const expansionIdByCode = new Map()

      for (const expansion of expansions) {
        const { rows } = await client.query(
          `
            INSERT INTO public.expansions (set_code, name, era, language, set_total, release_date, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (set_code) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, expansions.name),
              era = COALESCE(EXCLUDED.era, expansions.era),
              language = COALESCE(EXCLUDED.language, expansions.language),
              set_total = COALESCE(EXCLUDED.set_total, expansions.set_total),
              release_date = COALESCE(EXCLUDED.release_date, expansions.release_date),
              image_url = COALESCE(EXCLUDED.image_url, expansions.image_url)
            RETURNING id
          `,
          [
            expansion.set_code,
            expansion.name ?? null,
            expansion.era ?? null,
            expansion.language ?? 'EN',
            expansion.set_total ?? null,
            expansion.release_date ?? null,
            expansion.image_url ?? null
          ]
        )

        const expansionId = rows?.[0]?.id
        if (expansionId) {
          expansionIdByCode.set(expansion.set_code, expansionId)
        }
      }

      for (const expansion of expansions) {
        const catalogEntry = cardsBySetCode?.[expansion.set_code]
        const cards = catalogEntry?.cards ?? []
        const setTotal = catalogEntry?.set_total ?? expansion.set_total ?? null
        const expansionId = expansionIdByCode.get(expansion.set_code) ?? null

        if (!expansionId) continue

        for (const card of cards) {
          await client.query(
            `
              INSERT INTO public.cards (
                name,
                era,
                set_name,
                image_url,
                product_details,
                set_code,
                set_total,
                card_number,
                expansion_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT ON CONSTRAINT cards_expansion_card_number_key DO UPDATE SET
                name = EXCLUDED.name,
                set_name = EXCLUDED.set_name,
                era = COALESCE(EXCLUDED.era, cards.era),
                set_total = COALESCE(EXCLUDED.set_total, cards.set_total),
                set_code = COALESCE(EXCLUDED.set_code, cards.set_code),
                image_url = COALESCE(EXCLUDED.image_url, cards.image_url),
                product_details = COALESCE(EXCLUDED.product_details, cards.product_details)
            `,
            [
              card.name,
              card.era ?? expansion.era ?? null,
              card.set_name ?? expansion.name ?? null,
              card.image_url ?? null,
              card.product_details ?? null,
              catalogEntry?.set_code ?? expansion.set_code ?? null,
              setTotal,
              card.card_number,
              expansionId
            ]
          )
        }
      }

      await client.query('COMMIT')
      cachedExpansions = null
      lastExpansionFetch = 0
      hasSeededStaticCatalog = true
      return true
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Failed to seed static catalog into database', error)
      hasSeededStaticCatalog = false
      return false
    } finally {
      seedingCatalogPromise = null
      client.release()
    }
  })()

  return seedingCatalogPromise
}

async function fetchCachedExpansions(db) {
  const now = Date.now()
  if (cachedExpansions && now - lastExpansionFetch < 60_000) return cachedExpansions

  const { rows } = await db.query('SELECT id, set_code, name, era, set_total, language FROM public.expansions')
  cachedExpansions = rows
  lastExpansionFetch = now
  return rows
}

function filterCandidateExpansions(expansions, { eraHint = null, setHint = null } = {}) {
  const eraNorm = normalizeEra(eraHint)
  const setNorm = normalizeEra(setHint)

  return expansions.filter((expansion) => {
    const expansionEra = normalizeEra(expansion.era)
    const expansionName = normalizeEra(expansion.name)
    const expansionCode = normalizeEra(expansion.set_code)

    const eraMatches = !eraNorm || (expansionEra && expansionEra.includes(eraNorm))
    const setMatches =
      !setNorm ||
      (expansionCode && expansionCode.includes(setNorm)) ||
      (expansionName && expansionName.includes(setNorm))

    return eraMatches && setMatches
  })
}

// NOTE: intentionally no-op now (avoid noisy "unknown" cards)
async function ensureMissingSalesAreLinkedToCards() {
  hasBackfilledSalesCards = true
}

// --------------------
// Query helpers
// --------------------
function normalizeMatchConfidence(value) {
  if (!value) return null
  const v = String(value).toLowerCase()
  if (MATCH_CONFIDENCE_LEVELS.includes(v)) return v
  if (v === 'unmatched') return 'unmatched'
  return null
}

function normalizeMatchMethod(value) {
  if (!value) return null
  const v = String(value).toLowerCase()
  const found = MATCH_METHODS.find((m) => m.toLowerCase() === v)
  return found ?? null
}

function buildCardPreview(row) {
  if (!row.card_id) return null
  return {
    id: row.card_id,
    name: row.card_name,
    set_code: row.card_set_code,
    set_name: row.card_set_name,
    card_number: row.card_number,
    image_url: row.card_image_url
  }
}

function buildAuctionWithCard(row) {
  const card = buildCardPreview(row)
  const { card_name, card_set_code, card_set_name, card_number, card_image_url, ...rest } = row

  return {
    ...rest,
    parsed_set_candidates: row.parsed_set_candidates || [],
    parsed_set_guess: row.parsed_set_guess || null,
    parsed_set_confidence: row.parsed_set_confidence || null,
    parsed_total_in_set: row.parsed_total_in_set ?? rest.parsed_total_in_set ?? null,
    suggested_cards: row.suggested_cards || [],
    enrich_notes: row.enrich_notes || null,
    card
  }
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
    cardEra: row.card_era || row.pokemon_era || attributeValue('pokemon_era') || attributeValue('Era', 'Unknown era'),
    cardSetName: row.card_set_name || attributeValue('Series', 'Unknown set'),
    cardSetCode: row.card_set_code || null,
    cardNumber: row.card_number || attributeValue('Card number', null),
    seller: row.seller_alias || 'Unknown seller',
    sellerType: typeof row.seller_dsr === 'number' && row.seller_dsr >= 4.7 ? 'trusted' : 'new',
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

async function fetchAuctionsFromDatabase(filters = {}) {
  if (!pool) return []
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

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

async function createCard({ name, set_name, set_code = null, card_number = null, image_url = null, era = null }) {
  if (!pool) return null
  const ok = await ensureCardInfrastructure()
  if (!ok) return null

  const trimmedName = String(name || '').trim()
  const trimmedSetName = String(set_name || '').trim()
  const trimmedSetCode = set_code ? String(set_code).trim() : null
  const trimmedCardNumber = card_number ? String(card_number).trim() : null
  const trimmedEra = era ? String(era).trim() : null
  const safeImageUrl = image_url ? String(image_url).trim() : null

  if (!trimmedName || !trimmedSetName) throw new Error('name and set_name are required')

  const expansion = trimmedSetCode ? await findExpansionByCode(trimmedSetCode) : null

  const insertSql = `
    INSERT INTO public.cards (name, set_name, set_code, card_number, image_url, era, expansion_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `

  const { rows } = await pool.query(insertSql, [
    trimmedName,
    trimmedSetName,
    trimmedSetCode,
    trimmedCardNumber,
    safeImageUrl,
    trimmedEra || expansion?.era || null,
    expansion?.id || null
  ])

  if (!rows.length) return null
  return fetchCard(rows[0].id)
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

async function fetchEnrichmentAuctions({
  linkedOnly = null,
  confidence = null,
  q = null,
  hasImage = null,
  page = 1,
  pageSize = 50,
  startDate = null,
  endDate = null
} = {}) {
  if (!pool) return { items: [], total: 0, page: 1, pageSize: 50 }
  const ok = await ensureCardInfrastructure()
  if (!ok) return { items: [], total: 0, page: 1, pageSize: 50 }

  const where = []
  const params = []

  if (linkedOnly === true) where.push('ts.card_id IS NOT NULL')
  else if (linkedOnly === false) where.push('ts.card_id IS NULL')

  const normalizedConfidence = normalizeMatchConfidence(confidence)
  if (normalizedConfidence === 'unmatched') {
    where.push(`(ts.match_method = $1 OR (ts.card_id IS NULL AND ts.match_confidence IS NULL))`)
    params.push('unmatched')
  } else if (normalizedConfidence) {
    params.push(normalizedConfidence)
    where.push(`ts.match_confidence = $${params.length}`)
  }

  if (q) {
    params.push(`%${q}%`)
    const idx = params.length
    where.push(
      `(ts.title ILIKE $${idx} OR ts.description ILIKE $${idx} OR ts.item_url ILIKE $${idx} OR ts.seller_alias ILIKE $${idx})`
    )
  }

  if (hasImage === true) {
    where.push('(ts.thumbnail_url IS NOT NULL OR (ts.image_urls IS NOT NULL AND jsonb_array_length(ts.image_urls) > 0))')
  }

  if (startDate) {
    params.push(startDate)
    where.push(`ts.end_date >= $${params.length}`)
  }

  if (endDate) {
    params.push(endDate)
    where.push(`ts.end_date <= $${params.length}`)
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.max(1, Math.min(Number(pageSize) || 50, 200))
  const offset = Math.max(0, (Number(page) - 1 || 0) * limit)

  const baseSelect = `
    FROM public.tradera_sales ts
    LEFT JOIN public.cards c ON c.id = ts.card_id
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
    ${whereClause}
  `

  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total ${baseSelect}`, params)
  const total = countRows[0]?.total ?? 0

  params.push(limit)
  params.push(offset)

  const itemsQuery = `
    SELECT
      ts.*,
      c.name AS card_name,
      c.card_number AS card_number,
      c.image_url AS card_image_url,
      COALESCE(e.set_code, c.set_code) AS card_set_code,
      COALESCE(e.name, c.set_name) AS card_set_name
    ${baseSelect}
    ORDER BY ts.end_date DESC, ts.updated_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `

  const { rows } = await pool.query(itemsQuery, params)
  return { items: rows.map(buildAuctionWithCard), total, page: Number(page) || 1, pageSize: limit }
}

async function fetchEnrichmentAuctionById(id) {
  if (!pool) return null
  const ok = await ensureCardInfrastructure()
  if (!ok) return null

  const { rows } = await pool.query(
    `
      SELECT
        ts.*,
        c.name AS card_name,
        c.card_number AS card_number,
        c.image_url AS card_image_url,
        COALESCE(e.set_code, c.set_code) AS card_set_code,
        COALESCE(e.name, c.set_name) AS card_set_name
      FROM public.tradera_sales ts
      LEFT JOIN public.cards c ON c.id = ts.card_id
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
      WHERE ts.item_id = $1
      LIMIT 1
    `,
    [id]
  )

  if (!rows.length) return null
  return buildAuctionWithCard(rows[0])
}

async function searchCards(q, expansionId = null) {
  if (!pool) return []
  const ok = await ensureCardInfrastructure()
  if (!ok) return []

  const term = `%${q}%`
  const params = [term, term, term, term]
  const clauses = [
    '(c.name ILIKE $1 OR c.card_number ILIKE $2 OR COALESCE(e.name, c.set_name) ILIKE $3 OR COALESCE(e.set_code, c.set_code) ILIKE $4)'
  ]

  if (expansionId) {
    params.push(expansionId)
    clauses.push(`c.expansion_id = $${params.length}`)
  }

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        COALESCE(e.set_code, c.set_code) AS set_code,
        COALESCE(e.name, c.set_name) AS set_name,
        c.card_number,
        c.image_url
      FROM public.cards c
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.name ASC
      LIMIT 50
    `,
    params
  )

  return rows
}

async function tryAutoMatchAuction(client, row, parsedOverride = null) {
  const text = `${row.title || ''} ${row.description || ''}`
  const expansions = await fetchCachedExpansions(client)
  const updateFields = await resolveAuctionMatch(client, row, expansions)

  return {
    parsed_name: updateFields.parsed_name ?? parsedOverride?.parsed_name ?? parseCardName(text),
    parsed_card_number:
      updateFields.parsed_card_number ??
      parsedOverride?.parsed_card_number ??
      parseCardNumber(text).cardNumber,
    parsed_total_in_set:
      updateFields.parsed_total_in_set ??
      parsedOverride?.parsed_total_in_set ??
      parseCardNumber(text).denominator,
    parsed_set_hint: updateFields.parsed_set_hint ?? parsedOverride?.parsed_set_hint ?? parseSetHint(text),
    parsed_set_guess: updateFields.parsed_set_guess ?? null,
    parsed_set_confidence: updateFields.parsed_set_confidence ?? null,
    parsed_set_candidates: updateFields.parsed_set_candidates ?? [],
    suggested_cards: updateFields.suggested_cards ?? [],
    enrich_notes: updateFields.enrich_notes ?? null,
    match_method: updateFields.match_method,
    match_confidence: updateFields.match_confidence,
    card_id: updateFields.card_id,
    collision_candidates: updateFields.collision_candidates || []
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
    } catch (_err) {
      // not JSON
    }

    if (line) return line
  }

  return null
}

function runImporterScript(runUuid) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['scripts/tradera_importer.py'], {
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

async function fetchExpansionSummaries() {
  if (!pool) return getStaticExpansionSummaries()

  try {
    const ok = await ensureCardInfrastructure()
    if (!ok) return getStaticExpansionSummaries()

    const staticExpansions = await getStaticExpansionSummaries()
    const staticByCode = new Map(staticExpansions.map((expansion) => [expansion.set_code, expansion]))

    // Canonical set_code resolution (handles alias set_code / name variants from DB)
    const normalizeKey = (value) => (value ? String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '')

    const aliasToCanonicalCode = new Map()
    for (const expansion of staticExpansions) {
      const canonicalCode = expansion.set_code
      const normalizedCanonical = normalizeKey(canonicalCode)

      aliasToCanonicalCode.set(canonicalCode, canonicalCode)
      aliasToCanonicalCode.set(normalizedCanonical, canonicalCode)

      if (expansion.name) {
        aliasToCanonicalCode.set(normalizeKey(expansion.name), canonicalCode)
      }
    }

    const resolveCanonicalCode = (candidate) => {
      if (!candidate) return null
      const direct = aliasToCanonicalCode.get(candidate)
      if (direct) return direct

      const normalized = normalizeKey(candidate)
      return aliasToCanonicalCode.get(normalized) ?? null
    }

    const cardRowsQuery = `
      SELECT
        NULL::int AS id,
        COALESCE(e.set_code, c.set_code, c.set_name) AS set_code,
        COALESCE(e.name, c.set_name) AS name,
        COALESCE(e.era, c.era) AS era,
        COALESCE(e.language, c.language) AS language,
        COALESCE(e.set_total, c.set_total) AS set_total,
        COALESCE(e.release_date, c.release_date) AS release_date,
        COALESCE(e.image_url, c.image_url) AS image_url,
        COUNT(DISTINCT c.id)::int AS cards_total,
        0::int AS linked_auctions
      FROM public.cards c
      LEFT JOIN public.expansions e ON c.expansion_id = e.id
      GROUP BY 2, 3, 4, 5, 6, 7, 8
    `

    const expansionsQuery = `
      SELECT
        e.id,
        e.set_code,
        e.name,
        e.era,
        e.language,
        e.set_total,
        e.release_date,
        e.image_url,
        0::int AS cards_total,
        0::int AS linked_auctions
      FROM public.expansions e
    `

    const salesRowsQuery = `
      SELECT
        COALESCE(
          c.set_code,
          e.set_code,
          c.set_name,
          e.name,
          s.matched_set_code,
          s.parsed_set_code
        ) AS set_code,
        COUNT(s.item_id)::int AS linked_auctions
      FROM public.tradera_sales s
      LEFT JOIN public.cards c ON c.id = s.card_id
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
      WHERE s.card_id IS NOT NULL
      GROUP BY 1
    `

    const [cardRowsResult, expansionsResult, salesRowsResult] = await Promise.all([
      pool.query(cardRowsQuery),
      pool.query(expansionsQuery),
      pool.query(salesRowsQuery)
    ])

    const mergedRows = [...cardRowsResult.rows, ...expansionsResult.rows, ...salesRowsResult.rows]
    if (mergedRows.length === 0) return staticExpansions

    const mergedByCode = new Map()

    const mergeRows = (current, incoming) => {
      if (!current) return incoming
      return {
        id: current.id ?? incoming.id ?? null,
        set_code: current.set_code ?? incoming.set_code ?? null,
        name: current.name ?? incoming.name ?? null,
        era: current.era ?? incoming.era ?? null,
        language: current.language ?? incoming.language ?? null,
        set_total: current.set_total ?? incoming.set_total ?? null,
        release_date: current.release_date ?? incoming.release_date ?? null,
        image_url: current.image_url ?? incoming.image_url ?? null,
        cards_total: (current.cards_total ?? 0) + (incoming.cards_total ?? 0),
        linked_auctions: (current.linked_auctions ?? 0) + (incoming.linked_auctions ?? 0)
      }
    }

    for (const row of mergedRows) {
      const canonicalCode = resolveCanonicalCode(row.set_code) ?? resolveCanonicalCode(row.name) ?? row.set_code
      if (!canonicalCode && !row.set_code && !row.name) continue

      const normalizedRow = { ...row, set_code: canonicalCode ?? row.set_code ?? row.name ?? null }
      const current = mergedByCode.get(normalizedRow.set_code)
      mergedByCode.set(normalizedRow.set_code, mergeRows(current, normalizedRow))
    }

    // 1) Stable canonical ordering from static catalog
    const orderedResults = staticExpansions.map((expansion) => {
      const mergedRow = mergedByCode.get(expansion.set_code)
      const row = mergedRow ?? {}
      const fallback = staticByCode.get(expansion.set_code)

      return {
        ...row,
        set_code: expansion.set_code,
        name: row?.name ?? fallback?.name ?? null,
        era: row?.era ?? fallback?.era ?? null,
        language: row?.language ?? fallback?.language ?? null,
        set_total: row?.set_total ?? fallback?.set_total ?? null,
        release_date: row?.release_date ?? fallback?.release_date ?? null,
        image_url: row?.image_url ?? fallback?.image_url ?? null,
        cards_total: row?.cards_total ?? fallback?.cards_total ?? 0,
        linked_auctions: row?.linked_auctions ?? fallback?.linked_auctions ?? 0
      }
    })

    // 2) Append DB-only expansions not in static catalog
    for (const [setCode, row] of mergedByCode.entries()) {
      if (staticByCode.has(setCode)) continue
      orderedResults.push({
        ...row,
        set_code: setCode,
        name: row?.name ?? null,
        era: row?.era ?? null,
        language: row?.language ?? null,
        set_total: row?.set_total ?? null,
        release_date: row?.release_date ?? null,
        image_url: row?.image_url ?? null,
        cards_total: row?.cards_total ?? 0,
        linked_auctions: row?.linked_auctions ?? 0
      })
    }

    return orderedResults
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

app.get('/api/expansions', async (_req, res) => {
  try {
    const expansions = await fetchExpansionSummaries()
    return res.json(expansions)
  } catch (error) {
    console.error('Failed to fetch expansions', error)
    return res.status(500).json({ error: 'Failed to load expansions' })
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
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(fetched_at) AS last_fetched FROM public.tradera_sales')

    const { code, stdout, stderr } = await runImporterScript(runUuid)
    const durationMs = Date.now() - startTime

    const {
      rows: [after]
    } = await pool.query('SELECT COUNT(*)::int AS count, MAX(fetched_at) AS last_fetched FROM public.tradera_sales')

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
async function runEnrichmentJob({ limit = 500, logPrefix, runStartedAt } = {}) {
  return runEnrichmentJobCore({ pool, ensureCardInfrastructure, limit, logPrefix, runStartedAt })
}

app.post('/api/enrichment/run', async (req, res) => {
  try {
    const payload = await runEnrichmentJob({ limit: req.body?.limit })
    res.json(payload)
  } catch (error) {
    console.error('Failed to run enrichment matcher', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

// ✅ FIXED: no duplicate declarations, valid object literal, no undefined vars
app.post('/api/enrichment/run-all', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  const batchSize = Math.max(1, Math.min(Number(req.body?.batchSize) || 100, 1000))
  const maxBatches = Math.max(1, Math.min(Number(req.body?.maxBatches) || 1000, 5000))

  const runStartedAt = new Date()

  let totalAttempted = 0
  let totalLinked = 0
  let batches = 0
  let remainingBefore = null
  let remainingAfter = null
  const statusCounts = new Map()

  try {
    while (batches < maxBatches) {
      const result = await runEnrichmentJob({
        limit: batchSize,
        runStartedAt,
        logPrefix: `[Enrichment run @ ${runStartedAt.toISOString()}]`
      })

      totalAttempted += result.attempted
      totalLinked += result.linked
      remainingBefore = remainingBefore ?? result.remainingBefore
      remainingAfter = result.remainingAfter

      for (const [status, count] of Object.entries(result.statusCounts || {})) {
        statusCounts.set(status, (statusCounts.get(status) || 0) + count)
      }

      batches += 1

      if (!result.remainingAfter || result.remainingAfter <= 0 || result.attempted === 0) break
    }

    res.json({
      ok: true,
      batchSize,
      batches,
      totalAttempted,
      totalLinked,
      remainingBefore,
      remainingAfter,
      statusCounts: Object.fromEntries(statusCounts)
    })
  } catch (error) {
    console.error('Failed to run full enrichment pass', error)
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.post('/api/enrichment/discard', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  const itemId = Number(req.body?.itemId)
  if (!Number.isFinite(itemId)) return res.status(400).json({ ok: false, error: 'Invalid itemId' })

  const client = await pool.connect()
  try {
    const { rows: saleRows } = await client.query('SELECT item_id FROM public.tradera_sales WHERE item_id = $1 LIMIT 1', [
      itemId
    ])

    if (saleRows.length === 0) return res.status(404).json({ ok: false, error: 'Auction not found' })

    await client.query(
      `
        UPDATE public.tradera_sales
        SET
          card_id = NULL,
          match_status = 'Discarded (manual)',
          match_confidence = 'manual',
          match_method = 'manual_discard',
          updated_at = NOW()
        WHERE item_id = $1
      `,
      [itemId]
    )

    return res.json({ ok: true, itemId })
  } catch (error) {
    console.error('Failed to discard auction', error)
    return res.status(500).json({ ok: false, error: 'Failed to discard auction' })
  } finally {
    client.release()
  }
})

app.get('/api/enrichment/summary', async (_req, res) => {
  if (!pool) return res.status(500).json({ available: false, error: 'DATABASE_URL not set' })

  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE match_status LIKE 'Matched%')::int AS matched,
        COUNT(*) FILTER (WHERE match_status = 'Needs review')::int AS needs_review,
        COUNT(*) FILTER (WHERE match_status = 'Mismatched')::int AS mismatched,
        COUNT(*) FILTER (WHERE card_id IS NOT NULL)::int AS linked
      FROM public.tradera_sales
    `)

    res.json({
      available: true,
      totalAuctions: rows[0].total,
      matched: rows[0].matched,
      needsReview: rows[0].needs_review,
      mismatched: rows[0].mismatched,
      linkedAuctions: rows[0].linked
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
      SELECT item_id, end_date, title, match_status, parsed_card_number, parsed_set_total, matched_set_code
      FROM public.tradera_sales
      WHERE (match_status IS NULL OR match_status NOT LIKE 'Matched%')
        AND match_status <> 'Discarded (manual)'
      ORDER BY
        (matched_set_code IS NOT NULL) DESC,
        (parsed_card_number IS NOT NULL) DESC,
        end_date DESC
      LIMIT $1
    `,
    [limit]
  )
  res.json(rows)
})

app.get('/api/enrichment/recent', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })
  const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 200)

  const { rows } = await pool.query(
    `
      SELECT
        s.item_id,
        s.end_date,
        s.title,
        s.match_status,
        s.parsed_card_number,
        s.parsed_set_total,
        s.matched_set_code,
        s.card_id,
        c.name AS card_name,
        c.card_number,
        c.set_code AS card_set_code
      FROM public.tradera_sales s
      LEFT JOIN public.cards c ON c.id = s.card_id
      WHERE s.match_status IS NOT NULL
      ORDER BY s.updated_at DESC NULLS LAST, s.end_date DESC
      LIMIT $1
    `,
    [limit]
  )

  res.json(rows)
})

app.post('/api/enrichment/manual-match', async (req, res) => {
  if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' })

  const ok = await ensureCardInfrastructure()
  if (!ok) return res.status(500).json({ ok: false, error: 'Card infrastructure unavailable' })

  const itemId = Number(req.body?.itemId)
  const cardId = Number(req.body?.cardId)

  if (!Number.isFinite(itemId) || !Number.isFinite(cardId)) {
    return res.status(400).json({ ok: false, error: 'Invalid itemId or cardId' })
  }

  const client = await pool.connect()

  try {
    const { rows: saleRows } = await client.query('SELECT item_id FROM public.tradera_sales WHERE item_id = $1 LIMIT 1', [
      itemId
    ])

    if (saleRows.length === 0) return res.status(404).json({ ok: false, error: 'Auction not found' })

    const { rows: cardRows } = await client.query(
      `
        SELECT id, set_code, era, set_total, card_number
        FROM public.cards
        WHERE id = $1
        LIMIT 1
      `,
      [cardId]
    )

    if (cardRows.length === 0) return res.status(404).json({ ok: false, error: 'Card not found' })

    const card = cardRows[0]
    const parsedSetTotal = Number(card.set_total)
    const setTotalValue = Number.isFinite(parsedSetTotal) ? parsedSetTotal : null

    await client.query(
      `
        UPDATE public.tradera_sales
        SET
          card_id = $2,
          match_status = 'Matched (manual)',
          match_confidence = 'manual',
          match_method = 'manual',
          matched_set_code = COALESCE($3, matched_set_code),
          matched_era = COALESCE($4, matched_era),
          parsed_card_number = COALESCE($5, parsed_card_number),
          parsed_set_total = COALESCE($6, parsed_set_total),
          updated_at = NOW()
        WHERE item_id = $1
      `,
      [itemId, cardId, card.set_code || null, card.era || null, card.card_number || null, setTotalValue]
    )

    return res.json({ ok: true, itemId, cardId })
  } catch (error) {
    console.error('Failed to apply manual match', error)
    return res.status(500).json({ ok: false, error: 'Failed to apply manual match' })
  } finally {
    client.release()
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
app.use(express.static(distPath))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

module.exports = { app, pool, runEnrichmentJob, ensureCardInfrastructure }
