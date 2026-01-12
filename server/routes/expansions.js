const { resolveEraCode } = require('../era')

function createExpansionService({
  pool,
  ensureCardInfrastructure,
  ensureTraderaAuctionLinksTableAvailable
}) {
  async function fetchExpansionSummaries() {
    if (!pool) return []

    try {
      const ok = await ensureCardInfrastructure()
      if (!ok) return []

      const linksReady = ensureTraderaAuctionLinksTableAvailable
        ? await ensureTraderaAuctionLinksTableAvailable()
        : false

      const query = `
        SELECT
          e.id,
          e.set_code,
          e.set_name AS name,
          e.era AS era,
          e.language AS language,
          e.base_total AS set_number,
          e.base_total AS cards_in_set,
          e.set_total AS set_total,
          e.release_date AS release_date,
          e.image_url AS image_url,
          COUNT(DISTINCT c.id)::int AS cards_total,
          ${linksReady ? 'COUNT(DISTINCT l.auction_id)::int' : '0::int'} AS linked_auctions
        FROM public.expansions e
        LEFT JOIN public.cards c ON c.expansion_id = e.id
        ${linksReady ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
        GROUP BY e.id
        ORDER BY e.release_date NULLS LAST, e.set_name NULLS LAST
      `

      const { rows } = await pool.query(query)
      return rows.map((row) => {
        const eraLabel = row.era ?? null
        return {
          ...row,
          era_code: resolveEraCode(eraLabel),
          era_name: eraLabel
        }
      })
    } catch (error) {
      console.error('Failed to fetch expansions from database', error)
      return []
    }
  }

  function registerRoutes(app) {
    app.get('/api/expansions', async (_req, res) => {
      try {
        const expansions = await fetchExpansionSummaries()
        return res.json(expansions)
      } catch (error) {
        console.error('Failed to fetch expansions', error)
        return res.status(500).json({ error: 'Failed to load expansions' })
      }
    })

    app.get('/api/sets', async (_req, res) => {
      try {
        const expansions = await fetchExpansionSummaries()
        return res.json(expansions)
      } catch (error) {
        console.error('Failed to fetch sets', error)
        return res.status(500).json({ error: 'Failed to load sets' })
      }
    })
  }

  return { fetchExpansionSummaries, registerRoutes }
}

module.exports = { createExpansionService }
