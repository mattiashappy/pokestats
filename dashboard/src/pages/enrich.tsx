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

// --- Database & Environment Setup ---
const DATABASE_URL = process.env.DATABASE_URL
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    })
  : null

const PYTHON_BIN = process.env.PYTHON_BIN || 'python'
const PRICE_TRACKER_API_KEY = process.env.PRICE_TRACKER_API
const PRICE_TRACKER_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2'

// --- Middleware ---
app.use(compression())
app.use(express.json())

// --- Table State Helpers ---
let traderaAuctionsTableAvailable = false
let traderaAuctionLinksTableAvailable = false
let traderaAuctionLinksTableName = null
let traderaAuctionLinksAuctionIdColumn = null
let traderaAuctionLinksCardIdColumn = null
let traderaAuctionLinksLinkedAtColumn = null
let traderaAuctionLinksHasMethod = false
let traderaAuctionLinksHasConfidence = false

// --- Utility Functions ---
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
  return String(text || '').toLowerCase().replace(/[^a-z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractCardNumber(text) {
  const match = text.match(/\b([A-Za-z]{1,3})?\s*(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (match) return `${match[1] ? match[1].toUpperCase() : ''}${match[2]}/${match[3]}`
  const hashMatch = text.match(/(?:#|no\.?\s*)(\d{1,4})\b/i)
  return hashMatch ? hashMatch[1] : null
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Table & Column Resolution ---
async function ensureTraderaAuctionsTableAvailable() {
  if (!pool) return false
  const { rows } = await pool.query("SELECT to_regclass('public.tradera_auctions') AS tradera_auctions")
  traderaAuctionsTableAvailable = Boolean(rows?.[0]?.tradera_auctions)
  return traderaAuctionsTableAvailable
}

async function ensureTraderaAuctionLinksTableAvailable() {
  if (!pool) return false
  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.tradera_auction_pt_card_links') AS pt_links,
      to_regclass('public.tradera_auction_card_links') AS legacy_links
  `)
  const tableName = rows[0].pt_links ? 'tradera_auction_pt_card_links' : (rows[0].legacy_links ? 'tradera_auction_card_links' : null)
  if (!tableName) return false

  const { rows: columns } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [tableName])
  const colSet = new Set(columns.map(c => c.column_name))
  
  traderaAuctionLinksTableName = tableName
  traderaAuctionLinksAuctionIdColumn = colSet.has('auction_id') ? 'auction_id' : (colSet.has('item_id') ? 'item_id' : null)
  traderaAuctionLinksCardIdColumn = colSet.has('pt_card_id') ? 'pt_card_id' : 'card_id'
  traderaAuctionLinksLinkedAtColumn = colSet.has('created_at') ? 'created_at' : (colSet.has('linked_at') ? 'linked_at' : null)
  traderaAuctionLinksHasMethod = colSet.has('method')
  traderaAuctionLinksHasConfidence = colSet.has('confidence')

  traderaAuctionLinksTableAvailable = !!(traderaAuctionLinksAuctionIdColumn && traderaAuctionLinksCardIdColumn)
  return traderaAuctionLinksTableAvailable
}

async function getTraderaAuctionLinksConfig() {
  const ok = await ensureTraderaAuctionLinksTableAvailable()
  return ok ? {
    tableName: traderaAuctionLinksTableName,
    auctionIdColumn: traderaAuctionLinksAuctionIdColumn,
    cardIdColumn: traderaAuctionLinksCardIdColumn,
    linkedAtColumn: traderaAuctionLinksLinkedAtColumn,
    hasMethod: traderaAuctionLinksHasMethod,
    hasConfidence: traderaAuctionLinksHasConfidence,
    usesPtCards: traderaAuctionLinksCardIdColumn === 'pt_card_id'
  } : null
}

async function resolveTraderaAuctionColumns(linkConfig = null) {
  if (!pool) return null
  const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tradera_auctions'`)
  const columnNames = new Set(rows.map(r => r.column_name))
  const keyColumn = (linkConfig?.auctionIdColumn && columnNames.has(linkConfig.auctionIdColumn)) ? linkConfig.auctionIdColumn : (columnNames.has('item_id') ? 'item_id' : 'id')
  return { keyColumn, itemIdColumn: columnNames.has('item_id') ? 'item_id' : keyColumn }
}

// --- CORE FIX: Fetch Unlinked Auctions Logic ---
async function fetchUnlinkedAuctionSummaries({ limit = 100, offset = 0, language = 'all', diagnostics = [] } = {}) {
  if (!pool) return { rows: [], total: 0 }
  
  const [linkConfig, auctionsReady] = await Promise.all([getTraderaAuctionLinksConfig(), ensureTraderaAuctionsTableAvailable()])
  if (!linkConfig || !auctionsReady) return { rows: [], total: 0 }
  const auctionColumns = await resolveTraderaAuctionColumns(linkConfig)

  const params = []
  const where = [`l.${linkConfig.auctionIdColumn} IS NULL`]
  if (language !== 'all' && language !== 'none') {
    params.push(language)
    where.push(`COALESCE(a.pokemon_language, 'Unknown') = $${params.length}`)
  }

  // First, get raw unlinked data from DB
  const { rows } = await pool.query(`
    SELECT
      a.${auctionColumns.itemIdColumn} AS item_id,
      a.title, a.description, a.end_date, a.price, a.bid_count,
      a.item_url, a.seller_alias, a.pokemon_era, a.pokemon_language, a.item_condition
    FROM public.tradera_auctions a
    LEFT JOIN public.${linkConfig.tableName} l ON l.${linkConfig.auctionIdColumn} = a.${auctionColumns.keyColumn}
    WHERE ${where.join(' AND ')}
    ORDER BY a.end_date DESC
  `, params)

  const selectedSet = new Set(Array.isArray(diagnostics) ? diagnostics : [])

  // IF NO FILTERS: Return default slice immediately to fix the "No cards found" issue
  if (selectedSet.size === 0) {
    const safeOffset = Number(offset) || 0
    const safeLimit = Number(limit) || 100
    return {
      total: rows.length,
      rows: rows.slice(safeOffset, safeOffset + safeLimit).map(row => ({
        ...row,
        detected_collector_number: null,
        detected_expansion_name: null,
        detected_expansion_code: null
      }))
    }
  }

  // IF FILTERS EXIST: Perform heavy JS diagnostic logic
  const filteredRows = []
  // (Helper: Fetch sets for expansion matching if needed)
  const expansions = (selectedSet.has('No set match') || selectedSet.has('Ready to link')) ? 
    (await pool.query("SELECT pt_set_id as set_code, name FROM pt_sets WHERE name IS NOT NULL")).rows : []

  for (const row of rows) {
    const text = normalizeAuctionText(`${row.title || ''} ${row.description || ''}`)
    const collectorNumber = extractCardNumber(text)
    
    // Simple expansion match logic
    let matchedExp = null
    if (expansions.length > 0) {
        matchedExp = expansions.find(e => text.includes(e.name.toLowerCase()) || text.includes(e.set_code.toLowerCase()))
    }

    const issues = []
    if (!row.title) issues.push('Missing title')
    if (!row.description) issues.push('Missing description')
    if (!collectorNumber) issues.push('No card #')
    if (!matchedExp) issues.push('No set match')
    if (!row.pokemon_era) issues.push('No era')
    if (!row.pokemon_language) issues.push('No language')
    if (!row.item_condition) issues.push('No condition')

    const rowMarkers = issues.length ? issues : ['Ready to link']
    if (rowMarkers.some(m => selectedSet.has(m))) {
      filteredRows.push({
        ...row,
        detected_collector_number: collectorNumber,
        detected_expansion_name: matchedExp?.name || null,
        detected_expansion_code: matchedExp?.set_code || null
      })
    }
  }

  const safeOffset = Number(offset) || 0
  const safeLimit = Number(limit) || 100
  return {
    total: filteredRows.length,
    rows: filteredRows.slice(safeOffset, safeOffset + safeLimit)
  }
}

// --- API Routes ---
app.get('/api/linking/unlinked', async (req, res) => {
  try {
    const result = await fetchUnlinkedAuctionSummaries({
      limit: req.query.limit,
      offset: req.query.offset,
      language: req.query.language,
      diagnostics: req.query.diagnostics ? req.query.diagnostics.split(',') : []
    })
    res.json({
      total: result.total,
      rows: result.rows.map(r => ({
        itemId: r.item_id,
        title: r.title,
        description: r.description,
        endDate: r.end_date,
        price: r.price,
        bidCount: r.bid_count,
        itemUrl: r.item_url,
        sellerAlias: r.seller_alias,
        pokemonEra: r.pokemon_era,
        pokemonLanguage: r.pokemon_language,
        itemCondition: r.item_condition,
        detectedCollectorNumber: r.detected_collector_number,
        detectedExpansionName: r.detected_expansion_name,
        detectedExpansionCode: r.detected_expansion_code
      }))
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ total: 0, rows: [] })
  }
})

app.get('/api/sales', async (req, res) => {
  try {
    const auctionsReady = await ensureTraderaAuctionsTableAvailable()
    const auctionColumns = await resolveTraderaAuctionColumns()
    if (!auctionsReady) return res.json({ rows: [], total: 0 })

    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const offset = Number(req.query.offset) || 0
    const search = req.query.search ? `%${req.query.search}%` : null

    const where = []
    const params = []
    if (search) {
      params.push(search)
      where.push(`title ILIKE $${params.length}`)
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM tradera_auctions ${whereClause}`, params)
    const dataRes = await pool.query(`
      SELECT ${auctionColumns.itemIdColumn} as item_id, title, end_date, price, bid_count, item_url, thumbnail_url, seller_alias, pokemon_era, pokemon_language, item_condition
      FROM tradera_auctions ${whereClause}
      ORDER BY end_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset])

    res.json({ rows: dataRes.rows.map(normalizeTraderaAuctionRow), total: countRes.rows[0].total })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed' })
  }
})

// --- Placeholder/Remaining API Routes (Manual, Stats, etc.) ---
app.get('/api/linking/stats', async (req, res) => {
    const [linkConfig, auctionsReady] = await Promise.all([getTraderaAuctionLinksConfig(), ensureTraderaAuctionsTableAvailable()])
    if (!linkConfig || !auctionsReady) return res.json({ total: 0, linked: 0, unlinked: 0 })
    const { rows } = await pool.query(`
        SELECT COUNT(*)::int as total, COUNT(l.${linkConfig.auctionIdColumn})::int as linked
        FROM tradera_auctions a LEFT JOIN ${linkConfig.tableName} l ON l.${linkConfig.auctionIdColumn} = a.item_id
    `)
    res.json({ total: rows[0].total, linked: rows[0].linked, unlinked: rows[0].total - rows[0].linked })
})

app.post('/api/linking/manual', async (req, res) => {
    const { auctionId, cardId } = req.body
    const config = await getTraderaAuctionLinksConfig()
    await pool.query(`INSERT INTO ${config.tableName} (${config.auctionIdColumn}, ${config.cardIdColumn}, method) VALUES ($1, $2, 'manual') ON CONFLICT DO NOTHING`, [auctionId, cardId])
    res.json({ ok: true })
})

// --- Static Frontend Serving ---
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))