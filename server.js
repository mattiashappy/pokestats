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

app.set('trust proxy', 1)

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
const SESSION_COOKIE = 'pokestats_session'
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12)
const SESSION_TTL_MS = Math.max(1, Number.isFinite(SESSION_TTL_HOURS) ? SESSION_TTL_HOURS : 12) * 60 * 60 * 1000
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
const ADMIN_PASS = process.env.ADMIN_PASS ?? ''
const MEMBER_PASS = process.env.MEMBER_PASS ?? ''
const SELF_SIGNUP_ENABLED = process.env.SELF_SIGNUP_ENABLED === 'true'
const PYTHON_BIN = process.env.PYTHON_BIN || 'python'
const PRICE_TRACKER_API = process.env.PRICE_TRACKER_API
const PRICE_TRACKER_API_KEY = process.env.PRICE_TRACKER_API
const PRICE_TRACKER_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2'
const SUPPORTED_LANGUAGES = new Set(['english', 'japanese'])

const sessions = new Map()
const registeredUsers = [
  { name: 'Misty Williams', email: 'misty@cerulean.io', subscriptionStatus: 'active', trialEndsAt: null },
  { name: 'Brock Sanders', email: 'brock@pewterlabs.com', subscriptionStatus: 'active', trialEndsAt: null },
  { name: 'Erika Tanaka', email: 'erika@celadon.green', subscriptionStatus: 'trialing', trialEndsAt: '2024-08-27T08:00:00.000Z' },
  { name: 'Lt. Surge', email: 'surge@vermilion.energy', subscriptionStatus: 'inactive', trialEndsAt: null },
  { name: 'Sabrina Park', email: 'sabrina@saffron.ai', subscriptionStatus: 'trialing', trialEndsAt: '2024-08-24T08:00:00.000Z' }
]

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase()

const findRegisteredUser = (email) =>
  registeredUsers.find((user) => normalizeEmail(user.email) === normalizeEmail(email)) ?? null

const buildMemberUser = (email) => {
  const registered = findRegisteredUser(email)
  if (!registered) return null
  return {
    name: registered.name,
    email: registered.email,
    subscriptionStatus: registered.subscriptionStatus ?? 'inactive',
    trialEndsAt: registered.trialEndsAt ?? undefined,
    role: 'member'
  }
}

const buildAdminUser = (email) => ({
  name: 'PokéStats Admin',
  email,
  subscriptionStatus: 'active',
  role: 'admin'
})

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim()
    if (!trimmed) return acc
    const [key, ...rest] = trimmed.split('=')
    if (!key) return acc
    acc[key] = decodeURIComponent(rest.join('='))
    return acc
  }, {})

const buildCookie = (name, value, options = {}) => {
  const attributes = [`${name}=${value}`]
  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`)
  attributes.push(`Path=${options.path ?? '/'}`)
  if (options.httpOnly ?? true) attributes.push('HttpOnly')
  if (options.sameSite) attributes.push(`SameSite=${options.sameSite}`)
  if (options.secure) attributes.push('Secure')
  return attributes.join('; ')
}

const setSessionCookie = (res, sessionId) => {
  const cookie = buildCookie(SESSION_COOKIE, sessionId, {
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    httpOnly: true,
    sameSite: 'Lax',
    secure: IS_PRODUCTION
  })
  res.setHeader('Set-Cookie', cookie)
}

const clearSessionCookie = (res) => {
  const cookie = buildCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    secure: IS_PRODUCTION
  })
  res.setHeader('Set-Cookie', cookie)
}

const createSession = (user) => {
  const sessionId = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.set(sessionId, {
    user,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS
  })
  return sessionId
}

const getSession = (req) => {
  const cookies = parseCookies(req.headers.cookie ?? '')
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) return null
  const session = sessions.get(sessionId)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId)
    return null
  }
  session.lastSeenAt = Date.now()
  return { sessionId, session }
}

const respondUnauthorized = (res) => res.status(401).json({ error: 'Unauthorized' })

app.get('/api/auth/session', (req, res) => {
  const entry = getSession(req)
  if (!entry) return res.json({ user: null })
  const user = entry.session.user
  if (user.subscriptionStatus === 'trialing' && user.trialEndsAt) {
    const trialEndsAt = new Date(user.trialEndsAt)
    if (!Number.isNaN(trialEndsAt.getTime()) && Date.now() >= trialEndsAt.getTime()) {
      entry.session.user = { ...user, subscriptionStatus: 'active', trialEndsAt: undefined }
    }
  }
  return res.json({ user: entry.session.user })
})

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {}
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const isAdmin = ADMIN_EMAIL && ADMIN_PASS && normalizedEmail === ADMIN_EMAIL && password === ADMIN_PASS
  if (ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL && ADMIN_PASS && !isAdmin) {
    return res.status(401).json({ error: 'Invalid admin credentials' })
  }

  let user = null
  if (isAdmin) {
    user = buildAdminUser(normalizedEmail)
  } else {
    if (!MEMBER_PASS) {
      return res.status(403).json({ error: 'Member login is disabled until MEMBER_PASS is configured' })
    }
    if (password !== MEMBER_PASS) {
      return res.status(401).json({ error: 'Invalid member credentials' })
    }
    user = buildMemberUser(normalizedEmail)
    if (!user) {
      return res.status(403).json({ error: 'Account not found. Contact an administrator to request access.' })
    }
  }

  const sessionId = createSession(user)
  setSessionCookie(res, sessionId)
  return res.json({ user })
})

app.post('/api/auth/signup', (req, res) => {
  if (!SELF_SIGNUP_ENABLED) {
    return res.status(403).json({ error: 'Self-service signup is disabled. Contact an administrator to request access.' })
  }
  const { name, email } = req.body ?? {}
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' })
  }
  const displayName = String(name ?? '').trim() || 'New Trainer'
  const user = {
    name: displayName,
    email: normalizedEmail,
    subscriptionStatus: 'inactive',
    role: 'member'
  }
  const sessionId = createSession(user)
  setSessionCookie(res, sessionId)
  return res.json({ user })
})

app.post('/api/auth/logout', (req, res) => {
  const entry = getSession(req)
  if (entry) {
    sessions.delete(entry.sessionId)
  }
  clearSessionCookie(res)
  return res.json({ ok: true })
})

app.post('/api/auth/subscription', (req, res) => {
  const entry = getSession(req)
  if (!entry) return respondUnauthorized(res)
  const { status } = req.body ?? {}
  if (!['active', 'inactive', 'trialing'].includes(status)) {
    return res.status(400).json({ error: 'Invalid subscription status' })
  }
  if (entry.session.user.role === 'admin') {
    return res.status(403).json({ error: 'Admins do not update subscription status' })
  }
  const trialEndsAt =
    status === 'trialing' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : undefined
  entry.session.user = {
    ...entry.session.user,
    subscriptionStatus: status,
    trialEndsAt
  }
  return res.json({ user: entry.session.user })
})

app.post('/api/auth/trial', (req, res) => {
  const entry = getSession(req)
  if (!entry) return respondUnauthorized(res)
  if (entry.session.user.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot start trials' })
  }
  const { cardLast4 } = req.body ?? {}
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  entry.session.user = {
    ...entry.session.user,
    subscriptionStatus: 'trialing',
    trialEndsAt,
    cardLast4: cardLast4 ? String(cardLast4) : undefined
  }
  return res.json({ user: entry.session.user })
})

function normalizeLanguage(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'all') return null
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : 'english'
}

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
  const parsedId = Number(card.id)
  const overrideKey = CARD_METADATA_OVERRIDES.has(card.id)
    ? card.id
    : Number.isFinite(parsedId)
      ? parsedId
      : Number.isFinite(Number(card.tcgplayer_product_id))
        ? Number(card.tcgplayer_product_id)
        : null
  const overrides = overrideKey !== null ? CARD_METADATA_OVERRIDES.get(overrideKey) : null

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

async function fetchPtSetByIdentifier(setCode) {
  if (!pool) return null
  const ok = await ensurePriceTrackerImportTablesAvailable()
  if (!ok) return null

  const query = `
    SELECT pt_set_id, name
    FROM public.pt_sets
    WHERE pt_set_id = $1
       OR tcgplayer_set_id::text = $1
       OR LOWER(name) = LOWER($1)
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
  const energyType = Array.isArray(card?.energyType)
    ? card.energyType
    : card?.energyType
      ? [card.energyType]
      : null
  const parsedHp = Number(card?.hp)
  const flavorText = card?.flavorText ?? card?.flavor_text ?? null
  const priceHistory = card?.prices?.history ?? card?.priceHistory ?? card?.history ?? null

  return applyCardOverrides({
    id: Number.isFinite(parsedId) ? parsedId : 0,
    name: card?.name ?? null,
    era: expansion?.era ?? null,
    set_name: setName,
    set_code: setCode,
    set_total: setTotal,
    card_number: card?.cardNumber ?? null,
    price_market: card?.prices?.market ?? null,
    image_url: imageUrl,
    language: card?.language ?? 'English',
    product_details: buildPriceTrackerProductDetails(card),
    pokemon_type: card?.pokemonType ?? card?.pokemon_type ?? null,
    energy_type: energyType,
    stage: card?.stage ?? null,
    hp: Number.isFinite(parsedHp) ? parsedHp : null,
    flavor_text: flavorText,
    prices_data: card?.prices ?? null,
    price_history: priceHistory,
    expansion_id: expansion?.id ?? null,
    created_at: null
  })
}

// --------------------
// Database
// --------------------
const DATABASE_POOL = pool;

let hasCheckedTraderaAuctionsTable = false
let traderaAuctionsTableAvailable = false
let hasCheckedTraderaAuctionLinksTable = false
let traderaAuctionLinksTableAvailable = false
let traderaAuctionLinksTableName = null
let traderaAuctionLinksAuctionIdColumn = null
let traderaAuctionLinksCardIdColumn = null
let traderaAuctionLinksLinkedAtColumn = null
let traderaAuctionLinksHasMethod = false
let traderaAuctionLinksHasConfidence = false
let hasCheckedCardsTable = false
let cardsTableAvailable = false
let hasCheckedExpansionsTable = false
let expansionsTableAvailable = false
let hasCheckedImportRunsTable = false
let importRunsTableAvailable = false
let ensureCardInfrastructurePromise = null
let hasCheckedErasTable = false
let erasTableAvailable = false
let ptTablesAvailable = false
let ptTablesCheckedAt = 0
let ptLanguageColumnsCheckedAt = 0
let ptSetsLanguageAvailable = false
let ptCardsLanguageAvailable = false
let ptPriceColumnsCheckedAt = 0
let ptCardsPriceMarketAvailable = false
let localLanguageColumnsCheckedAt = 0
let expansionsLanguageAvailable = false
let cardsLanguageAvailable = false
const PT_CACHE_TTL_MS = 60_000

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

async function hasColumn(tableName, columnName) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  )
  return rows.length > 0
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

async function resolveTraderaAuctionColumns(linkConfig = null) {
  if (!pool) return null

  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tradera_auctions'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const keyColumn =
    (linkConfig?.auctionIdColumn && columnNames.has(linkConfig.auctionIdColumn) && linkConfig.auctionIdColumn) ||
    (columnNames.has('item_id') && 'item_id') ||
    (columnNames.has('auction_id') && 'auction_id') ||
    (columnNames.has('id') && 'id') ||
    null

  if (!keyColumn) return null

  const itemIdColumn = columnNames.has('item_id') ? 'item_id' : keyColumn

  return {
    keyColumn,
    itemIdColumn
  }
}

async function ensureTraderaAuctionLinksTableAvailable() {
  if (!pool) return false

  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.tradera_auction_pt_card_links') AS tradera_auction_pt_card_links,
      to_regclass('public.tradera_auction_card_links') AS tradera_auction_card_links
  `)

  const ptLinksAvailable = Boolean(rows?.[0]?.tradera_auction_pt_card_links)
  const legacyLinksAvailable = Boolean(rows?.[0]?.tradera_auction_card_links)
  let tableName = ptLinksAvailable ? 'tradera_auction_pt_card_links' : legacyLinksAvailable ? 'tradera_auction_card_links' : null

  if (ptLinksAvailable && legacyLinksAvailable) {
    const [ptRows, legacyRows] = await Promise.all([
      pool.query('SELECT 1 FROM public.tradera_auction_pt_card_links LIMIT 1'),
      pool.query('SELECT 1 FROM public.tradera_auction_card_links LIMIT 1')
    ])

    if (!ptRows.rows.length && legacyRows.rows.length) {
      tableName = 'tradera_auction_card_links'
    }
  }

  if (!tableName) {
    traderaAuctionLinksTableAvailable = false
    hasCheckedTraderaAuctionLinksTable = true
    return traderaAuctionLinksTableAvailable
  }

  const { rows: columnRows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  )

  const columnSet = new Set(columnRows.map((row) => row.column_name))
  traderaAuctionLinksTableName = tableName
  traderaAuctionLinksAuctionIdColumn = columnSet.has('auction_id')
    ? 'auction_id'
    : columnSet.has('item_id')
      ? 'item_id'
      : null
  traderaAuctionLinksCardIdColumn = columnSet.has('pt_card_id') ? 'pt_card_id' : columnSet.has('card_id') ? 'card_id' : null
  traderaAuctionLinksLinkedAtColumn = columnSet.has('created_at')
    ? 'created_at'
    : columnSet.has('linked_at')
      ? 'linked_at'
      : null
  traderaAuctionLinksHasMethod = columnSet.has('method')
  traderaAuctionLinksHasConfidence = columnSet.has('confidence')

  traderaAuctionLinksTableAvailable = Boolean(traderaAuctionLinksAuctionIdColumn && traderaAuctionLinksCardIdColumn)
  hasCheckedTraderaAuctionLinksTable = true

  return traderaAuctionLinksTableAvailable
}

async function getTraderaAuctionLinksConfig() {
  const ok = await ensureTraderaAuctionLinksTableAvailable()
  if (!ok) return null

  return {
    tableName: traderaAuctionLinksTableName,
    auctionIdColumn: traderaAuctionLinksAuctionIdColumn,
    cardIdColumn: traderaAuctionLinksCardIdColumn,
    linkedAtColumn: traderaAuctionLinksLinkedAtColumn,
    hasMethod: traderaAuctionLinksHasMethod,
    hasConfidence: traderaAuctionLinksHasConfidence,
    usesPtCards: traderaAuctionLinksCardIdColumn === 'pt_card_id'
  }
}

async function ensureLegacyTraderaAuctionLinksTableAvailable() {
  if (!pool) return false
  const { rows } = await pool.query(
    "SELECT to_regclass('public.tradera_auction_card_links') AS tradera_auction_card_links"
  )
  return Boolean(rows?.[0]?.tradera_auction_card_links)
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
  const now = Date.now()
  if (now - ptTablesCheckedAt < PT_CACHE_TTL_MS) return ptTablesAvailable

  ptTablesCheckedAt = now
  try {
    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.pt_sets') AS pt_sets,
        to_regclass('public.pt_cards') AS pt_cards
    `)

    ptTablesAvailable = Boolean(rows?.[0]?.pt_sets && rows?.[0]?.pt_cards)
  } catch (error) {
    console.error('PT table availability check failed', error)
    ptTablesAvailable = false
  }

  return ptTablesAvailable
}

async function ensurePtLanguageColumns() {
  if (!pool) return { ptSetsLanguageAvailable: false, ptCardsLanguageAvailable: false }

  const now = Date.now()
  if (now - ptLanguageColumnsCheckedAt < PT_CACHE_TTL_MS) {
    return { ptSetsLanguageAvailable, ptCardsLanguageAvailable }
  }

  ptLanguageColumnsCheckedAt = now

  const { rows } = await pool.query(
    `
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'language'
        AND table_name IN ('pt_sets', 'pt_cards')
    `
  )

  ptSetsLanguageAvailable = rows.some((row) => row.table_name === 'pt_sets')
  ptCardsLanguageAvailable = rows.some((row) => row.table_name === 'pt_cards')

  return { ptSetsLanguageAvailable, ptCardsLanguageAvailable }
}

async function ensurePtPriceColumns() {
  if (!pool) return { ptCardsPriceMarketAvailable: false }

  const now = Date.now()
  if (now - ptPriceColumnsCheckedAt < PT_CACHE_TTL_MS) {
    return { ptCardsPriceMarketAvailable }
  }

  ptPriceColumnsCheckedAt = now

  const { rows } = await pool.query(
    `
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'price_market'
        AND table_name = 'pt_cards'
    `
  )

  ptCardsPriceMarketAvailable = rows.some((row) => row.table_name === 'pt_cards')

  return { ptCardsPriceMarketAvailable }
}

async function ensureLocalLanguageColumns() {
  if (!pool) return { expansionsLanguageAvailable: false, cardsLanguageAvailable: false }

  const now = Date.now()
  if (now - localLanguageColumnsCheckedAt < PT_CACHE_TTL_MS) {
    return { expansionsLanguageAvailable, cardsLanguageAvailable }
  }

  localLanguageColumnsCheckedAt = now

  const [expansionsHasLanguage, cardsHasLanguage] = await Promise.all([
    hasColumn('expansions', 'language'),
    hasColumn('cards', 'language')
  ])

  expansionsLanguageAvailable = expansionsHasLanguage
  cardsLanguageAvailable = cardsHasLanguage

  return { expansionsLanguageAvailable, cardsLanguageAvailable }
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