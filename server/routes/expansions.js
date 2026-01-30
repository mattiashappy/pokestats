const { resolveEraCode } = require('../era')

let languageColumnsCheckedAt = 0
let ptSetsLanguageAvailable = false
let expansionsLanguageAvailable = false
const LANGUAGE_CACHE_TTL_MS = 5 * 60 * 1000
const SUPPORTED_LANGUAGES = new Set(['english', 'japanese'])

function normalizeLanguage(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'all') return null
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : 'english'
}

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

  async function ensureLanguageColumns() {
    if (!pool) return { ptSetsLanguageAvailable: false, expansionsLanguageAvailable: false }

    const now = Date.now()
    if (now - languageColumnsCheckedAt < LANGUAGE_CACHE_TTL_MS) {
      return { ptSetsLanguageAvailable, expansionsLanguageAvailable }
    }

    languageColumnsCheckedAt = now

    const { rows } = await pool.query(
      `
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'language'
          AND table_name IN ('pt_sets', 'expansions')
      `
    )

    ptSetsLanguageAvailable = rows.some((row) => row.table_name === 'pt_sets')
    expansionsLanguageAvailable = rows.some((row) => row.table_name === 'expansions')

    return { ptSetsLanguageAvailable, expansionsLanguageAvailable }
  }

  async function fetchExpansionSummaries(language = null) {
    if (!pool) return []

    try {
      const { ptSetsLanguageAvailable, expansionsLanguageAvailable } = await ensureLanguageColumns()
      const ptLanguageSelect = ptSetsLanguageAvailable ? 's.language' : 'NULL::text'
      const expansionLanguageSelect = expansionsLanguageAvailable ? 'e.language' : 'NULL::text'

      const linksReady = ensureTraderaAuctionLinksTableAvailable
        ? await ensureTraderaAuctionLinksTableAvailable()
        : false
      let priceTrackerReady = await ensurePriceTrackerTablesAvailable()

      if (priceTrackerReady) {
        const { rows: ptSetRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM public.pt_sets`)
        if ((ptSetRows?.[0]?.total ?? 0) === 0) {
          priceTrackerReady = false
        }
      }

      if (priceTrackerReady) {
        const ptParams = []
        const ptLanguageClause =
          ptSetsLanguageAvailable && language ? `WHERE LOWER(s.language) = LOWER($${ptParams.push(language)})` : ''

        const { rows } = await pool.query(
          `
          WITH pt_counts AS (
            SELECT pt_set_id, COUNT(*)::int AS cards_total
            FROM public.pt_cards
            GROUP BY pt_set_id
          ),
          pt_market_totals AS (
            SELECT pt_set_id, SUM(price_market)::numeric AS market_total
            FROM public.pt_cards
            GROUP BY pt_set_id
          )
          SELECT
            s.pt_set_id AS id,
            NULL::text AS set_code,
            s.pt_set_id AS pt_set_id,
            s.name AS name,
            s.series AS era,
            ${ptLanguageSelect} AS language,
            s.card_count AS set_number,
            s.card_count AS cards_in_set,
            COALESCE(s.card_count, pt_counts.cards_total) AS set_total,
            s.release_date AS release_date,
            COALESCE(s.image_cdn_url800, s.image_cdn_url400, s.image_cdn_url200, s.image_cdn_url) AS image_url,
            s.image_cdn_url200 AS image_cdn_url200,
            s.image_cdn_url400 AS image_cdn_url400,
            s.image_cdn_url800 AS image_cdn_url800,
            COALESCE(pt_counts.cards_total, 0)::int AS cards_total,
            pt_market_totals.market_total AS set_market_total,
            0::int AS linked_auctions
          FROM public.pt_sets s
          LEFT JOIN pt_counts ON pt_counts.pt_set_id = s.pt_set_id
          LEFT JOIN pt_market_totals ON pt_market_totals.pt_set_id = s.pt_set_id
          ${ptLanguageClause}
          ORDER BY s.release_date DESC NULLS LAST, s.name NULLS LAST, s.pt_set_id NULLS LAST
        `,
          ptParams
        )

        if (rows.length) {
          return rows.map((row) => {
            const eraLabel = row.era ?? null
            return {
              ...row,
              era_code: resolveEraCode(eraLabel),
              era_name: eraLabel
            }
          })
        }
      }

      const cardInfraReady = await ensureCardInfrastructure()
      if (!cardInfraReady) return []

      const expansionParams = []
      const fallbackParams = []
      const expansionLanguageClause =
        expansionsLanguageAvailable && language
          ? `WHERE LOWER(e.language) = LOWER($${expansionParams.push(language)})`
          : ptSetsLanguageAvailable && language
            ? `WHERE LOWER(s.language) = LOWER($${expansionParams.push(language)})`
            : ''
      const fallbackLanguageClause =
        expansionsLanguageAvailable && language ? `WHERE LOWER(e.language) = LOWER($${fallbackParams.push(language)})` : ''

      const query = priceTrackerReady
        ? `
        WITH pt_counts AS (
          SELECT pt_set_id, COUNT(*)::int AS cards_total
          FROM public.pt_cards
          GROUP BY pt_set_id
        ),
        pt_market_totals AS (
          SELECT pt_set_id, SUM(price_market)::numeric AS market_total
          FROM public.pt_cards
          GROUP BY pt_set_id
        )
        SELECT
          e.id,
          e.set_code,
          COALESCE(s.name, e.set_name) AS name,
          e.era AS era,
          ${expansionLanguageSelect} AS language,
          COALESCE(s.card_count, e.base_total) AS set_number,
          COALESCE(s.card_count, e.base_total) AS cards_in_set,
          COALESCE(e.set_total, s.card_count, pt_counts.cards_total) AS set_total,
          s.release_date AS release_date,
          COALESCE(s.image_cdn_url800, s.image_cdn_url400, s.image_cdn_url200, s.image_cdn_url, s.image_url) AS image_url,
          s.image_cdn_url200 AS image_cdn_url200,
          s.image_cdn_url400 AS image_cdn_url400,
          s.image_cdn_url800 AS image_cdn_url800,
          s.pt_set_id AS pt_set_id,
          COALESCE(pt_counts.cards_total, COUNT(DISTINCT c.id)::int) AS cards_total,
          pt_market_totals.market_total AS set_market_total,
          ${linksReady ? 'COUNT(DISTINCT l.auction_id)::int' : '0::int'} AS linked_auctions
        FROM public.expansions e
        LEFT JOIN LATERAL (
          SELECT
            name,
            card_count,
            release_date,
            image_cdn_url,
            image_cdn_url200,
            image_cdn_url400,
            image_cdn_url800,
            image_url,
            pt_set_id
          FROM public.pt_sets
          WHERE lower(name) = lower(e.set_name)
             OR pt_set_id = e.set_code
          ORDER BY release_date DESC NULLS LAST
          LIMIT 1
        ) s ON true
        LEFT JOIN pt_counts ON pt_counts.pt_set_id = s.pt_set_id
        LEFT JOIN pt_market_totals ON pt_market_totals.pt_set_id = s.pt_set_id
        LEFT JOIN public.cards c ON c.expansion_id = e.id
        ${linksReady ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
        ${expansionLanguageClause}
        GROUP BY
          e.id,
          s.name,
          s.card_count,
          s.release_date,
          s.image_cdn_url,
          s.image_cdn_url200,
          s.image_cdn_url400,
          s.image_cdn_url800,
          s.image_url,
          s.pt_set_id,
          pt_counts.cards_total,
          pt_market_totals.market_total
        ORDER BY e.set_name NULLS LAST, e.set_code NULLS LAST
      `
        : `
        SELECT
          e.id,
          e.set_code,
          e.set_name AS name,
          e.era AS era,
          ${expansionsLanguageAvailable ? 'e.language' : 'NULL::text'} AS language,
          e.base_total AS set_number,
          e.base_total AS cards_in_set,
          e.set_total AS set_total,
          NULL::date AS release_date,
          NULL::text AS image_url,
          NULL::text AS image_cdn_url200,
          NULL::text AS image_cdn_url400,
          NULL::text AS image_cdn_url800,
          NULL::text AS pt_set_id,
          COUNT(DISTINCT c.id)::int AS cards_total,
          NULL::numeric AS set_market_total,
          ${linksReady ? 'COUNT(DISTINCT l.auction_id)::int' : '0::int'} AS linked_auctions
        FROM public.expansions e
        LEFT JOIN public.cards c ON c.expansion_id = e.id
        ${linksReady ? 'LEFT JOIN public.tradera_auction_card_links l ON l.card_id = c.id' : ''}
        ${fallbackLanguageClause}
        GROUP BY e.id
        ORDER BY e.set_name NULLS LAST, e.set_code NULLS LAST
      `

      const params = priceTrackerReady ? expansionParams : fallbackParams
      const { rows } = await pool.query(query, params)
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
    app.get('/api/expansions', async (req, res) => {
      try {
        const language = normalizeLanguage(req.query.language)
        const expansions = await fetchExpansionSummaries(language)
        return res.json(expansions)
      } catch (error) {
        console.error('Failed to fetch expansions', error)
        return res.status(500).json({ error: 'Failed to load expansions' })
      }
    })

    app.get('/api/sets', async (req, res) => {
      try {
        const language = normalizeLanguage(req.query.language)
        const expansions = await fetchExpansionSummaries(language)
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
