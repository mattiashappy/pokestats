const { resolveAuctionMatch } = require('./numberFirstMatcher')
const { loadCatalog } = require('../catalog/catalogLoader')

async function buildDatabaseCardIndex(pool) {
  if (!pool) return {}
  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.card_number,
        COALESCE(e.set_code, c.set_code) AS set_code
      FROM public.cards c
      LEFT JOIN public.expansions e ON e.id = c.expansion_id
    `
  )

  const bySetAndNumber = {}
  for (const row of rows) {
    const setCode = row.set_code?.trim()
    const numeric = parseInt(String(row.card_number).split(/[\s/]/)[0], 10)
    if (!setCode || !Number.isFinite(numeric)) continue

    if (!bySetAndNumber[setCode]) bySetAndNumber[setCode] = {}
    bySetAndNumber[setCode][numeric] = row.id
  }

  return bySetAndNumber
}

async function runEnrichmentJob({
  pool,
  ensureCardInfrastructure,
  limit = 500,
  logPrefix,
  runStartedAt
} = {}) {
  if (!pool) throw new Error('DATABASE_URL not set')
  if (typeof ensureCardInfrastructure !== 'function') {
    throw new Error('ensureCardInfrastructure not provided')
  }

  const ok = await ensureCardInfrastructure()
  if (!ok) throw new Error('Card infrastructure unavailable')

  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000)
  const startedAt = runStartedAt ? new Date(runStartedAt) : new Date()
  const logLabel = logPrefix || `[Enrichment run @ ${startedAt.toISOString()}]`

  const client = await pool.connect()
  try {
    console.info(`${logLabel} Preparing matcher for up to ${safeLimit} auctions`)

    const { expansions, cardsBySetCode } = await loadCatalog()
    const cardIndex = await buildDatabaseCardIndex(pool)

    const unprocessedClause =
      'card_id IS NULL AND COALESCE(NULLIF(match_status, \'\'), NULL) IS NULL'

    const {
      rows: [before]
    } = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM public.tradera_sales
        WHERE ${unprocessedClause}
          AND COALESCE(match_status, '') <> 'Discarded (manual)'
      `
    )

    const { rows } = await client.query(
      `
        SELECT item_id, title, attributes, era, pokemon_era
        FROM public.tradera_sales
        WHERE ${unprocessedClause}
          AND COALESCE(match_status, '') <> 'Discarded (manual)'
        ORDER BY end_date ASC NULLS LAST
        LIMIT $1
      `,
      [safeLimit]
    )

    const statusCounts = new Map()
    let linked = 0
    let processed = 0

    for (const row of rows) {
      const match = await resolveAuctionMatch(client, row, expansions, cardsBySetCode)

      if (match.set_inference_reason === 'ambiguous') {
        console.warn(
          `${logLabel} Ambiguous set inference for item ${row.item_id}: ${JSON.stringify(
            match.parsed_set_candidates
          )}`
        )
      }

      const matchedCardId =
        match.card_id ||
        (match.matched_set_code && match.parsed_card_number
          ? cardIndex?.[match.matched_set_code]?.[match.parsed_card_number] || null
          : null)

      if (matchedCardId) linked++

      const confidence = match.match_confidence || (matchedCardId ? 'medium' : null)
      const derivedStatus = matchedCardId
        ? `Matched (${confidence ? confidence.charAt(0).toUpperCase() + confidence.slice(1) : 'Low'})`
        : match.matched_set_code || match.parsed_set_guess
          ? 'Needs review'
          : 'Unmatched'

      const matchStatus = match.match_status || derivedStatus

      const debugPayload = { ...match, matched_card_id: matchedCardId }

      await client.query(
        `
          UPDATE public.tradera_sales
          SET
            match_status = $2,
            match_confidence = $3,
            matched_set_code = $4,
            matched_era = $5,
            parsed_card_number = $6,
            parsed_set_total = $7,
            card_id = $8,
            match_debug = $9,
            updated_at = NOW()
          WHERE item_id = $1
        `,
        [
          row.item_id,
          matchStatus,
          confidence,
          match.matched_set_code || match.parsed_set_guess,
          match.matched_era || row.era || row.pokemon_era || row.attributes?.pokemon_era?.[0] || null,
          match.parsed_card_number,
          match.parsed_total_in_set || match.parsed_set_total,
          matchedCardId,
          JSON.stringify(debugPayload)
        ]
      )

      statusCounts.set(matchStatus || 'Unknown', (statusCounts.get(matchStatus || 'Unknown') || 0) + 1)

      processed++
      if (processed % 50 === 0) {
        console.info(`${logLabel} Progress: processed ${processed}/${rows.length}`)
      }
    }

    const {
      rows: [after]
    } = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM public.tradera_sales
        WHERE ${unprocessedClause}
          AND COALESCE(match_status, '') <> 'Discarded (manual)'
      `
    )

    const payload = {
      ok: true,
      attempted: rows.length,
      linked,
      statusCounts: Object.fromEntries(statusCounts),
      remainingBefore: before?.count ?? null,
      remainingAfter: after?.count ?? null
    }

    console.info(
      `${logLabel} Completed matcher run. Attempted ${payload.attempted}, linked ${payload.linked}, ` +
        `remaining ${payload.remainingAfter}/${payload.remainingBefore} before next run, status counts: ${JSON.stringify(
          payload.statusCounts
        )}`
    )

    return payload
  } finally {
    client.release()
  }
}

module.exports = { runEnrichmentJob }
