const { resolveEraCode } = require('../era')

function createExpansionService({
  pool,
  ensureCardInfrastructure,
  ensureTraderaAuctionLinksTableAvailable
}) {
  async function ensurePriceTrackerTablesAvailable() {
    if (!pool) return false

    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.pt_sets') AS pt_sets,
        to_regclass('public.pt_cards') AS pt_cards
    `)

    return Boolean(rows?.[0]?.pt_sets && rows?.[0]?.pt_cards)
  }

  async function fetchExpansionSummaries() {
    if (!pool) return []

    try {
      const ok = await ensureCardInfrastructure()
      if (!ok) return []

      const linksReady = ensureTraderaAuctionLinksTableAvailable
        ? await ensureTraderaAuctionLinksTableAvailable()
        : false
      const priceTrackerReady = await ensurePriceTrackerTablesAvailable()

      const query = priceTrackerReady
        ? `
        WITH pt_counts AS (
          SELECT pt_set_id, COUNT(*)::int AS cards_total
          FROM public.pt_cards
          GROUP BY pt_set_id
        )
        SELECT
          e.id,
          e.set_code,
          COALESCE(s.name, e.set_name) AS name,
          e.era AS era,
          NULL::text AS language,
          COALESCE(s.card_count, e.base_total) AS set_number,
          COALESCE(s.card_count, e.base_total) AS cards_in_set,
          COALESCE(e.set_total, s.card_count, pt_counts.cards_total) AS set_total,
          s.release_date AS release_date,
          COALESCE(s.image_cdn_url400, s.image_cdn_url, s.image_url) AS image_url,
          COALESCE(pt_counts.cards_total, COUNT(DISTINCT c.id)::int) AS cards_total,
          ${linksReady ? 'COUNT(DISTINCT l.auction_id)::int' : '0::int'} AS linked_auctions
        FROM public.expansions e
        LEFT JOIN LATERAL (
          SELECT
            name,
            card_count,
            release_date,
            image_cdn_url,
            image_cdn_url400,
            image_url,
            pt_set_id
          FROM public.pt_sets
          WHERE lower(name) = lower(e.set_name)
             OR pt_set_id = e.set_code
          ORDER BY release_date DESC NULLS LAST
          LIMIT 1
        ) s ON true
        LEFT JOIN pt_counts ON pt_counts.pt_set_id = s.pt_set_id
        LEFT JOIN public.cards c ON c.expansion_id = e.id
        ${linksReady ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
        GROUP BY
          e.id,
          s.name,
          s.card_count,
          s.release_date,
          s.image_cdn_url,
          s.image_cdn_url400,
          s.image_url,
          pt_counts.cards_total
        ORDER BY e.set_name NULLS LAST, e.set_code NULLS LAST
      `
        : `
        SELECT
          e.id,
          e.set_code,
          e.set_name AS name,
          e.era AS era,
          NULL::text AS language,
          e.base_total AS set_number,
          e.base_total AS cards_in_set,
          e.set_total AS set_total,
          NULL::date AS release_date,
          NULL::text AS image_url,
          COUNT(DISTINCT c.id)::int AS cards_total,
          ${linksReady ? 'COUNT(DISTINCT l.auction_id)::int' : '0::int'} AS linked_auctions
        FROM public.expansions e
        LEFT JOIN public.cards c ON c.expansion_id = e.id
        ${linksReady ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
        GROUP BY e.id
        ORDER BY e.set_name NULLS LAST, e.set_code NULLS LAST
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
