const { resolveEraCode } = require('../era')

let languageColumnsCheckedAt = 0
let ptSetsLanguageAvailable = false
let expansionsLanguageAvailable = false
let setValueMonthlyCheckedAt = 0
let setValueMonthlyAvailable = false
const LANGUAGE_CACHE_TTL_MS = 5 * 60 * 1000
const SET_VALUE_CACHE_TTL_MS = 5 * 60 * 1000
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

  async function ensureSetValueMonthlyAvailable() {
    if (!pool) return false

    const now = Date.now()
    if (now - setValueMonthlyCheckedAt < SET_VALUE_CACHE_TTL_MS) {
      return setValueMonthlyAvailable
    }

    setValueMonthlyCheckedAt = now
    const { rows } = await pool.query(`
      SELECT to_regclass('public.set_value_monthly') AS set_value_monthly
    `)
    setValueMonthlyAvailable = Boolean(rows?.[0]?.set_value_monthly)
    return setValueMonthlyAvailable
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

  async function ensurePricingColumns() {
    if (!pool) return { ptCardsPricesDataAvailable: false }

    try {
      const { ptSetsLanguageAvailable, expansionsLanguageAvailable } = await ensureLanguageColumns()
      const priceTrackerReady = await ensurePriceTrackerTablesAvailable()
      const setValueMonthlyReady = await ensureSetValueMonthlyAvailable()

      // Keep parity with older startup checks; do not block set listing on failure.
      if (ensureCardInfrastructure) {
        try {
          await ensureCardInfrastructure()
        } catch (infraError) {
          console.warn('Card infrastructure check failed while loading expansions; continuing.', infraError)
        }
      }

      const params = []
      const languageClause =
        expansionsLanguageAvailable && language
          ? `WHERE LOWER(e.language) = LOWER($${params.push(language)})`
          : priceTrackerReady && ptSetsLanguageAvailable && language
            ? `WHERE LOWER(s.pt_language) = LOWER($${params.push(language)})`
            : ''

      const query = `
        WITH db_counts AS (
          SELECT expansion_id, COUNT(*)::int AS db_cards_count
          FROM public.cards
          GROUP BY expansion_id
        )
        ${priceTrackerReady ? `,
        pt_set_match AS (
          SELECT DISTINCT ON (e.id)
            e.id AS expansion_id,
            s.pt_set_id,
            s.card_count,
            s.release_date,
            s.image_cdn_url,
            s.image_cdn_url200,
            s.image_cdn_url400,
            s.image_cdn_url800,
            s.image_url,
            s.name,
            ${ptSetsLanguageAvailable ? 's.language' : 'NULL::text'} AS pt_language
          FROM public.expansions e
          LEFT JOIN public.pt_sets s
            ON e.set_code IS NOT NULL
            AND s.pt_set_id = e.set_code
          ORDER BY e.id, s.release_date DESC NULLS LAST
        )` : ''}
        ${setValueMonthlyReady ? `,
        monthly_ranked AS (
          SELECT
            svm.set_code,
            svm.month,
            svm.set_value,
            ROW_NUMBER() OVER (PARTITION BY svm.set_code ORDER BY svm.month DESC, svm.created_at DESC) AS rn
          FROM public.set_value_monthly svm
          WHERE svm.set_code IS NOT NULL
        ),
        latest_monthly AS (
          SELECT
            m1.set_code,
            m1.set_value AS current_value,
            m2.set_value AS previous_value
          FROM monthly_ranked m1
          LEFT JOIN monthly_ranked m2
            ON m2.set_code = m1.set_code
            AND m2.rn = 2
          WHERE m1.rn = 1
        )` : ''}
        SELECT
          e.id,
          e.set_code,
          e.set_name,
          COALESCE(${priceTrackerReady ? 's.name' : 'NULL::text'}, e.set_name) AS name,
          e.era,
          ${expansionsLanguageAvailable ? 'e.language' : priceTrackerReady && ptSetsLanguageAvailable ? 's.pt_language' : 'NULL::text'} AS language,
          e.base_total,
          e.set_total,
          ${priceTrackerReady ? 's.card_count' : 'NULL::int'} AS pt_card_count,
          COALESCE(db.db_cards_count, 0)::int AS db_cards_count,
          COALESCE(
            e.set_total,
            ${priceTrackerReady ? 's.card_count' : 'NULL::int'},
            e.base_total,
            db.db_cards_count
          ) AS derived_total,
          ${priceTrackerReady ? 's.release_date' : 'NULL::date'} AS release_date,
          ${priceTrackerReady ? "COALESCE(s.image_cdn_url800, s.image_cdn_url400, s.image_cdn_url200, s.image_cdn_url, s.image_url)" : 'NULL::text'} AS image_url,
          ${priceTrackerReady ? 's.image_cdn_url200' : 'NULL::text'} AS image_cdn_url200,
          ${priceTrackerReady ? 's.image_cdn_url400' : 'NULL::text'} AS image_cdn_url400,
          ${priceTrackerReady ? 's.image_cdn_url800' : 'NULL::text'} AS image_cdn_url800,
          ${priceTrackerReady ? 's.pt_set_id' : 'NULL::text'} AS pt_set_id,
          COALESCE(db.db_cards_count, 0)::int AS cards_total,
          ${setValueMonthlyReady ? 'latest.current_value' : 'NULL::numeric'} AS set_market_total,
          ${setValueMonthlyReady
            ? `CASE
              WHEN latest.previous_value IS NULL OR latest.previous_value = 0 THEN NULL::numeric
              ELSE ((latest.current_value - latest.previous_value) / latest.previous_value) * 100
            END`
            : 'NULL::numeric'} AS set_market_change_pct,
          0::int AS linked_auctions
        FROM public.expansions e
        LEFT JOIN db_counts db ON db.expansion_id = e.id
        ${priceTrackerReady ? 'LEFT JOIN pt_set_match s ON s.expansion_id = e.id' : ''}
        ${setValueMonthlyReady ? 'LEFT JOIN latest_monthly latest ON latest.set_code = e.set_code' : ''}
        ${languageClause}
        ORDER BY e.set_name NULLS LAST, e.set_code NULLS LAST
      `

      const { rows } = await pool.query(query, params)

      return rows.map((row) => {
        const eraLabel = row.era ?? null
        return {
          ...row,
          set_total: row.derived_total ?? row.set_total ?? null,
          set_number: row.base_total ?? null,
          cards_in_set: row.base_total ?? null,
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
