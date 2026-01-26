const { matchAuctionsWithAi, DEFAULT_MODEL } = require('../ai/auctionCardMatcher')
const { matchAuctionsWithVision, DEFAULT_MODEL: DEFAULT_VISION_MODEL } = require('../ai/auctionImageMatcher')

function parseLimit(value, fallback = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function parseItemIds(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
}

function registerAiRoutes(app, { pool }) {
  app.post('/api/ai/tradera/match', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

    const apiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'OPEN_AI not set' })
    }

    const limit = parseLimit(req.body?.limit, null)
    const itemIds = parseItemIds(req.body?.itemIds)
    const model = req.body?.model || DEFAULT_MODEL
    const client = await pool.connect()

    try {
      const result = await matchAuctionsWithAi({
        client,
        limit,
        apiKey,
        model,
        itemIds
      })
      return res.json(result)
    } catch (error) {
      console.error('Failed to match auctions with AI', error)
      return res.status(500).json({ error: 'Failed to match auctions' })
    } finally {
      client.release()
    }
  })

  app.post('/api/ai/tradera/vision-match', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL not set' })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not set' })
    }

    const itemIds = parseItemIds(req.body?.itemIds)
    const model = req.body?.model || DEFAULT_VISION_MODEL
    const minConfidence = req.body?.minConfidence
    const client = await pool.connect()

    try {
      const result = await matchAuctionsWithVision({
        client,
        apiKey,
        model,
        itemIds,
        minConfidence
      })
      return res.json(result)
    } catch (error) {
      console.error('Failed to match auctions with vision', error)
      return res.status(500).json({ error: 'Failed to match auctions' })
    } finally {
      client.release()
    }
  })
}

module.exports = { registerAiRoutes }
