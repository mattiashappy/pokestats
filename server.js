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

async function fetchAuctionsFromDatabase() {
  if (!pool) return []

  const tableExists = await ensureSalesTableAvailable()
  if (!tableExists) return []

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
      fetched_at
    FROM tradera_sales
    ORDER BY end_date DESC
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
    title: row.title || 'Untitled listing',
    cardName: attributeValue('Card name', row.title || 'Unknown card'),
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
