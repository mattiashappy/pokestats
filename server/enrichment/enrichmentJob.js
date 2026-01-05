const { resolveAuctionMatch } = require('./numberFirstMatcher')
const { loadCatalog } = require('../catalog/catalogLoader')

async function buildDatabaseCardIndex(db) {
  if (!db) return {}

  const { rows } = await db.query(`
    SELECT
      c.id,
      c.card_number,
      COALESCE(e.set_code, c.set_code) AS set_code
    FROM public.cards c
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
  `)

  const bySetAndNumber = {}
  for (const row of rows) {
    const setCode = typeof row.set_code === 'string' ? row.set_code.trim() : null
    const raw = row.card_number == null ? '' : String(row.card_number)
    const numeric = parseInt(raw.split(/[\s/]/)[0], 10)

    if (!setCode || !Number.isFinite(numeric)) continue

    if (!bySetAndNumber[setCode]) bySetAndNumber[setCode] = {}
    bySetAndNumber[setCode][numeric] = row.id
  }

  return bySetAndNumber
}

function normalizeConfidenceScore(confidenceText, fallbackStatus, matchedCardId) {
  if (typeof confidenceText === 'number' && Number.isFinite(confidenceText)) return confidenceText

  const normalized = typeof confidenceText === 'string' ? confidenceText.toLowerCase() : null
  if (normalized === 'high') return 90
  if (normalized === 'medium') return 60
  if (normalized === 'low') return 30

  if (matchedCardId) return 60
  if (fallbackStatus === 'needs_review') return 50
  if (fallbackStatus === 'unmatched') return 10

  return null
}

function toIntOrNull(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = parseInt(String(value).trim(), 10)
  return Number.isFinite(n) ? n : null
}

async function runEnrichmentJob({
  pool,
  ensureCardInfrastructure,
  limit = 500,
  logPrefix,
  runStartedAt,
  target = 'unprocessed'
} = {}) {
  if (!pool) throw new Error('DATABASE_URL not set')
  if (typeof ensureCardInfrastructure !== 'function') throw new Error('ensureCardInfrastructure not provided')

  const ok = await ensureCardInfrastructure()
  if (!ok) throw new Error('Card infrastructure unavailable')

  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000)
  const startedAt = runStartedAt ? new Date(runStartedAt) : new Date()
  const logLabel = logPrefix || `[Enrichment run @ ${startedAt.toISOString()}]`

  // IMPORTANT: this was previously computed but unused
  const updatedBeforeClause =
    target === 'unlinked'
      ? `AND COALESCE(updated_at, end_date, 'epoch'::timestamp) < '${startedAt.toISOString()}'`
      : ''

  const client = await pool.connect()
  try {
    console.info(`${logLabel} Preparing matcher for up to ${safeLimit} auctions`)

    // Release stuck "processing" rows before counting/claiming
    await client.query(`
      UPDATE public.tradera_sales
      SET match_status = NULL, processing_started_at = NULL
      WHERE match_status = 'processing'
        AND processing_started_at < NOW() - INTERVAL '30 minutes'
    `)

    const { expansions, cardsBySetCode } = await loadCatalog()
    const cardIndex = await buildDatabaseCardIndex(client)

    const unprocessedClause = "COALESCE(match_status, '') = ''"

    // FIX: COALESCE(match_status,'') so NULL rows aren't excluded by <> comparison
    const unlinkedClause =
      "card_id IS NULL " +
      "AND COALESCE(match_status, '') <> 'Discarded (manual)' " +
      "AND (match_status IS NULL OR match_status NOT LIKE 'Matched%')"

    const baseWhereClause = target === 'unlinked' ? unlinkedClause : unprocessedClause
    const whereClause = `${baseWhereClause} ${updatedBeforeClause}`

    const {
      rows: [before]
    } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM public.tradera_sales
      WHERE ${whereClause}
    `)

    let rows = []

    // Claim rows transactionally to avoid multi-dyno conflicts
    await client.query('BEGIN')
    try {
      const claimResult = await client.query(
        `
          WITH batch AS (
            SELECT item_id
            FROM public.tradera_sales
            WHERE ${whereClause}
              AND COALESCE(match_status, '') <> 'processing'
            ORDER BY updated_at ASC NULLS FIRST, end_date ASC NULLS LAST, item_id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE public.tradera_sales ts
          SET match_status = 'processing', processing_started_at = NOW(), updated_at = NOW()
          FROM batch b
          WHERE ts.item_id = b.item_id
          RETURNING ts.item_id, ts.title, ts.description, ts.attributes, ts.era, ts.pokemon_era
        `,
        [safeLimit]
      )

      rows = claimResult.rows
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    const statusCounts = new Map()
    let linked = 0
    let processed = 0

    for (const row of rows) {
      let match
      try {
        match = await resolveAuctionMatch(client, row, expansions, cardsBySetCode)
      } catch (error) {
        console.error(`${logLabel} Error resolving match for item ${row.item_id}`, error)
        throw error
      }

      if (match.set_inference_reason === 'ambiguous') {
        console.warn(
          `${logLabel} Ambiguous set inference for item ${row.item_id}: ${JSON.stringify(
            match.parsed_set_candidates
          )}`
        )
      }

      const parsedCardNoRaw = match.parsed_card_no ?? match.parsed_card_number ?? null
      const parsedCardNo = toIntOrNull(parsedCardNoRaw)

      const matchedCardId =
        match.card_id ||
        (match.matched_set_code && parsedCardNo != null
          ? cardIndex?.[match.matched_set_code]?.[parsedCardNo] || null
          : null)

      if (matchedCardId) linked++

      const confidenceText = match.match_confidence || (matchedCardId ? 'medium' : null)

      const derivedStatus = matchedCardId
        ? 'matched'
        : match.matched_set_code || match.parsed_set_guess
          ? 'needs_review'
          : 'unmatched'

      const matchConfidenceScore = normalizeConfidenceScore(
        match.match_confidence_score ?? confidenceText,
        derivedStatus,
        matchedCardId
      )

      const matchConfidenceLabel =
        match.match_confidence ||
        (matchConfidenceScore != null
          ? matchConfidenceScore >= 80
            ? 'high'
            : matchConfidenceScore >= 50
              ? 'medium'
              : 'low'
          : null)

      const debugPayload = { ...match, matched_card_id: matchedCardId }

      const matchStatus =
        match.match_status ||
        (derivedStatus === 'matched'
          ? 'Matched (Auto)'
          : derivedStatus === 'needs_review'
            ? 'Needs review'
            : 'Unmatched')

      if (!matchedCardId) {
        console.warn(
          `${logLabel} No card linked for item ${row.item_id} (${matchStatus}). Parsed card: ${match.parsed_card_no ||
            match.parsed_card_number || 'n/a'}, set guess: ${match.matched_set_code || match.parsed_set_guess || 'n/a'}, ` +
            `title: ${row.title?.slice(0, 140) || 'n/a'}`
        )
      }

      await client.query(
        `
          UPDATE public.tradera_sales
          SET
            match_status = $2,
            enrich_status = $3,
            match_confidence = $4,
            match_confidence_score = $5,
            matched_set_code = $6,
            matched_era = $7,
            parsed_card_no = $8,
            parsed_number_text = $9,
            parsed_set_total = $10,
            card_id = $11,
            match_debug = $12,
            processing_started_at = NULL,
            updated_at = NOW()
          WHERE item_id = $1
        `,
        [
          row.item_id,
          matchStatus,
          derivedStatus,
          matchConfidenceLabel,
          matchConfidenceScore,
          match.matched_set_code || match.parsed_set_guess || null,
          match.matched_era ||
            row.era ||
            row.pokemon_era ||
            row.attributes?.pokemon_era?.[0] ||
            null,
          parsedCardNo,
          match.parsed_number_text || null,
          match.parsed_total_in_set || match.parsed_set_total || null,
          matchedCardId,
          JSON.stringify(debugPayload)
        ]
      )

      statusCounts.set(derivedStatus || 'unknown', (statusCounts.get(derivedStatus || 'unknown') || 0) + 1)

      processed++
      if (processed % 50 === 0) {
        console.info(`${logLabel} Progress: processed ${processed}/${rows.length}`)
      }
    }

    const {
      rows: [after]
    } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM public.tradera_sales
      WHERE ${whereClause}
    `)

    const payload = {
      ok: true,
      attempted: rows.length,
      linked,
      statusCounts: Object.fromEntries(statusCounts),
      remainingBefore: before?.count ?? null,
      remainingAfter: after?.count ?? null,
      target
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