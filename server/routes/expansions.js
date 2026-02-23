const { resolveEraCode } = require('../era')

let languageColumnsCheckedAt = 0
let ptSetsLanguageAvailable = false
let setSnapshotsCheckedAt = 0
let setSnapshotsAvailable = false
let setMetricsViewCheckedAt = 0
let setMetricsViewAvailable = false
const LANGUAGE_CACHE_TTL_MS = 5 * 60 * 1000
const SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000
const VIEW_CACHE_TTL_MS = 5 * 60 * 1000
const SUPPORTED_LANGUAGES = new Set(['english', 'japanese'])

function normalizeLanguage(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'all') return null
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : 'english'
}

function createExpansionService({ pool, ensureCardInfrastructure }) {
  async function ensurePriceTrackerTablesAvailable() {
    if (!pool) return false

    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.pt_sets') AS pt_sets,
        to_regclass('public.pt_cards') AS pt_cards
    `)

    return Boolean(rows?.[0]?.pt_sets && rows?.[0]?.pt_cards)
  }

  async function ensureSetSnapshotsAvailable() {
    if (!pool) return false

    const now = Date.now()
    if (now - setSnapshotsCheckedAt < SNAPSHOT_CACHE_TTL_MS) {
      return setSnapshotsAvailable
    }

    setSnapshotsCheckedAt = now
    const { rows } = await pool.query(`
      SELECT to_regclass('public.set_value_snapshots') AS set_value_snapshots
    `)
    setSnapshotsAvailable = Boolean(rows?.[0]?.set_value_snapshots)
    return setSnapshotsAvailable
  }

  async function ensureSetMetricsViewAvailable() {
    if (!pool) return false

    const now = Date.now()
    if (now - setMetricsViewCheckedAt < VIEW_CACHE_TTL_MS) {
      return setMetricsViewAvailable
    }

    setMetricsViewCheckedAt = now
    const { rows } = await pool.query(`
      SELECT to_regclass('public.v_set_metrics_current') AS v_set_metrics_current
    `)
    setMetricsViewAvailable = Boolean(rows?.[0]?.v_set_metrics_current)
    return setMetricsViewAvailable
  }

  async function ensureLanguageColumns() {
    if (!pool) return { ptSetsLanguageAvailable: false }

    const now = Date.now()
    if (now - languageColumnsCheckedAt < LANGUAGE_CACHE_TTL_MS) {
      return { ptSetsLanguageAvailable }
    }

    languageColumnsCheckedAt = now

    const { rows } = await pool.query(
      `
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'language'
          AND table_name IN ('pt_sets')
      `
    )

    ptSetsLanguageAvailable = rows.some((row) => row.table_name === 'pt_sets')
    return { ptSetsLanguageAvailable }
  }

  async function fetchExpansionSummaries(language = null) {
    if (!pool) return []

    try {
      const { ptSetsLanguageAvailable } = await ensureLanguageColumns()
      const priceTrackerReady = await ensurePriceTrackerTablesAvailable()
      const snapshotsReady = await ensureSetSnapshotsAvailable()
      const metricsViewReady = await ensureSetMetricsViewAvailable()

      if (!priceTrackerReady) return []

      if (ensureCardInfrastructure) {
        try {
          await ensureCardInfrastructure()
        } catch (infraError) {
          console.warn('Card infrastructure check failed while loading sets; continuing.', infraError)
        }
      }

      const params = []
      const languageClause =
        ptSetsLanguageAvailable && language
          ? `WHERE LOWER(ps.language) = LOWER($${params.push(language)})`
          : ''

      const metricsSource = metricsViewReady
        ? `
          SELECT
            set_id,
            cards_total,
            market_total
          FROM public.v_set_metrics_current
        `
        : `
          SELECT
            c.pt_set_id AS set_id,
            COUNT(*)::int AS cards_total,
            COALESCE(SUM(c.price_market), 0)::numeric AS market_total
          FROM public.pt_cards c
          GROUP BY c.pt_set_id
        `

      const snapshotsCtes = snapshotsReady
        ? `,
        current_month_ranked AS (
          SELECT
            svs.set_id,
            svs.market_total,
            ROW_NUMBER() OVER (
              PARTITION BY svs.set_id
              ORDER BY svs.date DESC, svs.created_at DESC
            ) AS rn
          FROM public.set_value_snapshots svs
          WHERE date_trunc('month', svs.date) = date_trunc('month', CURRENT_DATE)
        ),
        previous_month_ranked AS (
          SELECT
            svs.set_id,
            svs.market_total,
            ROW_NUMBER() OVER (
              PARTITION BY svs.set_id
              ORDER BY svs.date DESC, svs.created_at DESC
            ) AS rn
          FROM public.set_value_snapshots svs
          WHERE date_trunc('month', svs.date) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        ),
        snapshot_points AS (
          SELECT
            c.set_id,
            c.market_total AS current_market_total,
            p.market_total AS previous_market_total
          FROM current_month_ranked c
          LEFT JOIN previous_month_ranked p
            ON p.set_id = c.set_id
            AND p.rn = 1
          WHERE c.rn = 1
        )`
        : ''

      const snapshotsSelect = snapshotsReady
        ? `
          CASE
            WHEN sp.previous_market_total IS NULL OR sp.previous_market_total = 0 THEN NULL::numeric
            ELSE ((sp.current_market_total - sp.previous_market_total) / sp.previous_market_total) * 100
          END AS mom_change_pct,
          CASE
            WHEN sp.previous_market_total IS NULL THEN NULL::numeric
            ELSE sp.current_market_total - sp.previous_market_total
          END AS mom_change_value
        `
        : 'NULL::numeric AS mom_change_pct, NULL::numeric AS mom_change_value'

      const snapshotsJoin = snapshotsReady ? 'LEFT JOIN snapshot_points sp ON sp.set_id = ps.pt_set_id' : ''

      const query = `
        WITH pt_metrics AS (
          ${metricsSource}
        )
        ${snapshotsCtes}
        SELECT
          ps.pt_set_id AS set_id,
          ps.pt_set_id AS set_code,
          ps.name,
          ps.series AS era,
          ${ptSetsLanguageAvailable ? 'ps.language' : 'NULL::text'} AS language,
          ps.release_date,
          COALESCE(ps.image_cdn_url800, ps.image_cdn_url400, ps.image_cdn_url200, ps.image_cdn_url, ps.image_url) AS image_url,
          ps.image_cdn_url200,
          ps.image_cdn_url400,
          ps.image_cdn_url800,
          COALESCE(NULLIF(ps.card_count, 0), pm.cards_total, 0)::int AS card_count,
          COALESCE(pm.market_total, 0)::numeric AS market_total,
          ${snapshotsSelect}
        FROM public.pt_sets ps
        LEFT JOIN pt_metrics pm ON pm.set_id = ps.pt_set_id
        ${snapshotsJoin}
        ${languageClause}
        ORDER BY ps.name NULLS LAST, ps.pt_set_id NULLS LAST
      `

      const { rows } = await pool.query(query, params)
      return rows.map((row) => {
        const eraLabel = row.era ?? null
        return {
          ...row,
          id: row.set_id,
          pt_set_id: row.set_id,
          set_total: row.card_count,
          cards_total: row.card_count,
          set_market_total: row.market_total,
          set_market_change_pct: row.mom_change_pct,
          linked_auctions: 0,
          era_code: resolveEraCode(eraLabel),
          era_name: eraLabel
        }
      })
    } catch (error) {
      console.error('Failed to fetch sets from PT tables', error)
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
