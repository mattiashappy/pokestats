const { resolveEraCode } = require('../era')

function normalizeKey(value) {
  return value ? String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

function buildAliasMap(staticExpansions) {
  const aliasToCanonicalCode = new Map()

  for (const expansion of staticExpansions) {
    const canonicalCode = expansion.set_code
    const normalizedCanonical = normalizeKey(canonicalCode)

    aliasToCanonicalCode.set(canonicalCode, canonicalCode)
    aliasToCanonicalCode.set(normalizedCanonical, canonicalCode)

    if (expansion.name) {
      aliasToCanonicalCode.set(normalizeKey(expansion.name), canonicalCode)
    }
  }

  return aliasToCanonicalCode
}

function createExpansionService({ pool, ensureCardInfrastructure, getStaticExpansionSummaries }) {
  async function fetchExpansionSummaries() {
    if (!pool) return getStaticExpansionSummaries()

    try {
      const ok = await ensureCardInfrastructure()
      if (!ok) return getStaticExpansionSummaries()

      const staticExpansions = await getStaticExpansionSummaries()
      const staticByCode = new Map(staticExpansions.map((expansion) => [expansion.set_code, expansion]))
      const aliasToCanonicalCode = buildAliasMap(staticExpansions)

      const resolveCanonicalCode = (candidate) => {
        if (!candidate) return null
        const direct = aliasToCanonicalCode.get(candidate)
        if (direct) return direct

        const normalized = normalizeKey(candidate)
        return aliasToCanonicalCode.get(normalized) ?? null
      }

      const cardRowsQuery = `
      SELECT
        NULL::int AS id,
        COALESCE(e.set_code, c.set_code, c.set_name) AS set_code,
        COALESCE(e.name, c.set_name) AS name,
        COALESCE(er.name, e.era, c.era) AS era,
        er.code AS era_code,
        COALESCE(e.language, c.language) AS language,
        COALESCE(e.set_total, c.set_total) AS set_total,
        COALESCE(e.release_date, c.release_date) AS release_date,
        COALESCE(e.image_url, c.image_url) AS image_url,
        COUNT(DISTINCT c.id)::int AS cards_total,
        COUNT(a.item_id)::int AS linked_auctions
      FROM public.cards c
      LEFT JOIN public.expansions e ON c.expansion_id = e.id
      LEFT JOIN public.eras er ON er.id = e.era_id
      LEFT JOIN public.auctions a ON a.card_id = c.id
      GROUP BY 2, 3, 4, 5, 6, 7, 8, 9
    `

      const expansionsQuery = `
      SELECT
        e.id,
        e.set_code,
        e.name,
        COALESCE(er.name, e.era) AS era,
        er.code AS era_code,
        e.language,
        e.set_total,
        e.release_date,
        e.image_url,
        0::int AS cards_total,
        0::int AS linked_auctions
      FROM public.expansions e
      LEFT JOIN public.eras er ON er.id = e.era_id
    `

      const salesBySetQuery = `
      SELECT
        COALESCE(e.set_code, c.set_code, c.set_name, a.parsed_set_code) AS set_code,
        COUNT(a.item_id)::int AS linked_auctions
      FROM public.auctions a
      LEFT JOIN public.cards c ON c.id = a.card_id
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
      GROUP BY 1
    `

      const [cardRowsResult, expansionsResult, salesBySetResult] = await Promise.all([
        pool.query(cardRowsQuery),
        pool.query(expansionsQuery),
        pool.query(salesBySetQuery)
      ])

      const mergedRows = [...cardRowsResult.rows, ...expansionsResult.rows]
      if (mergedRows.length === 0) return staticExpansions

      const mergedByCode = new Map()

      const mergeRows = (current, incoming) => {
        if (!current) return incoming
        return {
          id: current.id ?? incoming.id ?? null,
          set_code: current.set_code ?? incoming.set_code ?? null,
          name: current.name ?? incoming.name ?? null,
          era: current.era ?? incoming.era ?? null,
          era_code: current.era_code ?? incoming.era_code ?? null,
          language: current.language ?? incoming.language ?? null,
          set_total: current.set_total ?? incoming.set_total ?? null,
          release_date: current.release_date ?? incoming.release_date ?? null,
          image_url: current.image_url ?? incoming.image_url ?? null,
          cards_total: (current.cards_total ?? 0) + (incoming.cards_total ?? 0),
          linked_auctions: (current.linked_auctions ?? 0) + (incoming.linked_auctions ?? 0)
        }
      }

      for (const row of mergedRows) {
        const canonicalCode = resolveCanonicalCode(row.set_code) ?? resolveCanonicalCode(row.name) ?? row.set_code
        if (!canonicalCode && !row.set_code && !row.name) continue

        const normalizedRow = { ...row, set_code: canonicalCode ?? row.set_code ?? row.name ?? null }
        const current = mergedByCode.get(normalizedRow.set_code)
        mergedByCode.set(normalizedRow.set_code, mergeRows(current, normalizedRow))
      }

      for (const row of salesBySetResult.rows || []) {
        if (!row?.set_code) continue
        const canonicalCode =
          resolveCanonicalCode(row.set_code) ?? resolveCanonicalCode(row.name) ?? row.set_code ?? null
        if (!canonicalCode) continue

        const existing = mergedByCode.get(canonicalCode) ?? { set_code: canonicalCode }
        mergedByCode.set(canonicalCode, {
          ...existing,
          set_code: canonicalCode,
          linked_auctions: (existing.linked_auctions ?? 0) + (row.linked_auctions ?? 0)
        })
      }

      const orderedResults = staticExpansions.map((expansion) => {
        const mergedRow = mergedByCode.get(expansion.set_code)
        const row = mergedRow ?? {}
        const fallback = staticByCode.get(expansion.set_code)

        const eraLabel = row?.era ?? fallback?.era ?? null
        const eraCode = row?.era_code ?? resolveEraCode(eraLabel)

        return {
          ...row,
          set_code: expansion.set_code,
          name: row?.name ?? fallback?.name ?? null,
          era: eraLabel,
          era_code: eraCode,
          era_name: eraLabel,
          language: row?.language ?? fallback?.language ?? null,
          set_total: row?.set_total ?? fallback?.set_total ?? null,
          release_date: row?.release_date ?? fallback?.release_date ?? null,
          image_url: row?.image_url ?? fallback?.image_url ?? null,
          cards_total: row?.cards_total ?? fallback?.cards_total ?? 0,
          linked_auctions: row?.linked_auctions ?? fallback?.linked_auctions ?? 0
        }
      })

      for (const [setCode, row] of mergedByCode.entries()) {
        if (staticByCode.has(setCode)) continue
        const eraLabel = row?.era ?? null
        const eraCode = row?.era_code ?? resolveEraCode(eraLabel)

        orderedResults.push({
          ...row,
          set_code: setCode,
          name: row?.name ?? null,
          era: eraLabel,
          era_code: eraCode,
          era_name: eraLabel,
          language: row?.language ?? null,
          set_total: row?.set_total ?? null,
          release_date: row?.release_date ?? null,
          image_url: row?.image_url ?? null,
          cards_total: row?.cards_total ?? 0,
          linked_auctions: row?.linked_auctions ?? 0
        })
      }

      return orderedResults
    } catch (error) {
      console.error('Falling back to canonical expansions due to DB error', error)
      return getStaticExpansionSummaries()
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
