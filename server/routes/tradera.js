const { parseAuctions, linkAuctions } = require('../tradera/traderaLinker')

function parseLimit(value, fallback = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function registerTraderaRoutes(app, { pool }) {
  app.post('/api/tradera/parse', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

    const limit = parseLimit(req.body?.limit, null)
    const client = await pool.connect()

    try {
      const result = await parseAuctions({ client, limit })
      return res.json(result)
    } catch (error) {
      console.error('Failed to parse tradera auctions', error)
      return res.status(500).json({ error: 'Failed to parse auctions' })
    } finally {
      client.release()
    }
  })

  app.post('/api/tradera/link', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

    const limit = parseLimit(req.body?.limit, 500)
    const client = await pool.connect()

    try {
      const result = await linkAuctions({ client, limit })
      return res.json(result)
    } catch (error) {
      console.error('Failed to link tradera auctions', error)
      return res.status(500).json({ error: 'Failed to link auctions' })
    } finally {
      client.release()
    }
  })
}

module.exports = { registerTraderaRoutes }
