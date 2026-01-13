const { matchAuctionsWithAi, DEFAULT_MODEL } = require('../ai/auctionCardMatcher')

function parseLimit(value, fallback = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function registerAiRoutes(app, { pool }) {
  app.post('/api/ai/tradera/match', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not set' })
    }

    const limit = parseLimit(req.body?.limit, null)
    const model = req.body?.model || DEFAULT_MODEL
    const client = await pool.connect()

    try {
      const result = await matchAuctionsWithAi({
        client,
        limit,
        apiKey,
        model
      })
      return res.json(result)
    } catch (error) {
      console.error('Failed to match auctions with AI', error)
      return res.status(500).json({ error: 'Failed to match auctions' })
    } finally {
      client.release()
    }
  })
}

module.exports = { registerAiRoutes }
