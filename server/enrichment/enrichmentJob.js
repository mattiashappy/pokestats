const { resolveAuctionMatch } = require('./numberFirstMatcher')
const { loadCatalog } = require('../catalog/catalogLoader')

const SET_CODE_NORMALIZATION = {
  BLACK_BOLD: 'BLACK_BOLT'
}

function normalizeSetCode(setCode) {
  if (!setCode) return null
  const normalized = String(setCode).trim().toUpperCase()
  return SET_CODE_NORMALIZATION[normalized] || normalized
}

function pickCandidateSetCode(match, row) {
  const explicitSet = normalizeSetCode(match?.matched_set_code || match?.parsed_set_guess)
  if (explicitSet) return explicitSet

  const candidates = Array.isArray(match?.parsed_set_candidates) ? match.parsed_set_candidates : []
  const normalizedCandidates = candidates
    .map((candidate) => ({ ...candidate, set_code: normalizeSetCode(candidate.set_code) }))
    .filter((candidate) => candidate.set_code)

  const title = `${row?.title || ''} ${row?.description || ''}`.toLowerCase()
  const titleHints = [
    { regex: /gym heroes/i, set_code: 'GYMHEROES' },
    { regex: /gym challenge/i, set_code: 'GYMCHALLENGE' }
  ]

  for (const hint of titleHints) {
    if (hint.regex.test(title)) {
      const normalized = normalizeSetCode(hint.set_code)
      const fromCandidates = normalizedCandidates.find((candidate) => candidate.set_code === normalized)
      return fromCandidates?.set_code || normalized
    }
  }

  if (normalizedCandidates.length === 1) return normalizedCandidates[0].set_code

  if (normalizedCandidates.length > 1) {
    const [best] = [...normalizedCandidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return best?.set_code || null
  }

  return null
}

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
    const setCode = normalizeSetCode(row.set_code)
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
      ? `AND COALESCE(ae.updated_at, a.updated_at, a.end_date, 'epoch'::timestamp) < '${startedAt.toISOString()}'`
      : ''

  const client = await pool.connect()
  try {
    console.info(`${logLabel} Preparing matcher for up to ${safeLimit} auctions`)

    // Release stuck "processing" rows before counting/claiming
    await client.query(`
      UPDATE public.auction_enrichment
      SET match_status = NULL, processing_started_at = NULL
      WHERE match_status = 'processing'
        AND processing_started_at < NOW() - INTERVAL '30 minutes'
    `)

    const { expansions, cardsBySetCode } = await loadCatalog()
    const cardIndex = await buildDatabaseCardIndex(client)

    const unprocessedClause = "COALESCE(ae.match_status, '') = ''"

    // FIX: COALESCE(match_status,'') so NULL rows aren't excluded by <> comparison
    const unlinkedClause =
      "a.card_id IS NULL " +
      "AND COALESCE(ae.match_status, '') <> 'Discarded (manual)' " +
      "AND (ae.match_status IS NULL OR ae.match_status NOT LIKE 'Matched%')"

    const baseWhereClause = target === 'unlinked' ? unlinkedClause : unprocessedClause
    const whereClause = `${baseWhereClause} ${updatedBeforeClause}`

    const {
      rows: [before]
    } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM public.auctions a
      LEFT JOIN public.auction_enrichment ae ON ae.item_id = a.item_id
      WHERE ${whereClause}
    `)

    let rows = []

    // Claim rows transactionally to avoid multi-dyno conflicts
    await client.query('BEGIN')
    try {
      const claimResult = await client.query(
        `
          WITH batch AS (
            SELECT a.item_id, a.title, a.description, a.attributes, a.era, a.pokemon_era, a.updated_at, a.end_date
            FROM public.auctions a
            LEFT JOIN public.auction_enrichment ae ON ae.item_id = a.item_id
            WHERE ${whereClause}
              AND COALESCE(ae.match_status, '') <> 'processing'
            ORDER BY COALESCE(ae.updated_at, a.updated_at, a.end_date) ASC NULLS FIRST, a.end_date ASC NULLS LAST, a.item_id ASC
            LIMIT $1
            FOR UPDATE OF a SKIP LOCKED
          ), upsert AS (
            INSERT INTO public.auction_enrichment (item_id, match_status, processing_started_at, updated_at)
            SELECT item_id, 'processing', NOW(), NOW() FROM batch
            ON CONFLICT (item_id) DO UPDATE SET
              match_status = EXCLUDED.match_status,
              processing_started_at = EXCLUDED.processing_started_at,
              updated_at = EXCLUDED.updated_at
            RETURNING item_id
          )
          SELECT b.item_id, b.title, b.description, b.attributes, b.era, b.pokemon_era
          FROM batch b
          JOIN upsert u ON u.item_id = b.item_id
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

      const chosenSetCode = normalizeSetCode(pickCandidateSetCode(match, row))

      const matchedCardId =
        match.card_id ||
        (chosenSetCode && parsedCardNo != null ? cardIndex?.[chosenSetCode]?.[parsedCardNo] || null : null)

      if (matchedCardId) linked++

      const confidenceText = match.match_confidence || (matchedCardId ? 'medium' : null)

      const derivedStatus = matchedCardId ? 'matched' : chosenSetCode ? 'needs_review' : 'unmatched'

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

      const debugPayload = { ...match, matched_card_id: matchedCardId, selected_set_code: chosenSetCode }

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
            match.parsed_card_number || 'n/a'}, set guess: ${chosenSetCode || match.parsed_set_guess || 'n/a'}, ` +
            `title: ${row.title?.slice(0, 140) || 'n/a'}`
        )
      }

      await client.query(
        `
          INSERT INTO public.auction_enrichment (
            item_id,
            match_status,
            enrich_status,
            match_confidence,
            match_confidence_score,
            matched_set_code,
            matched_era,
            parsed_card_no,
            parsed_number_text,
            parsed_set_total,
            match_debug,
            processing_started_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NOW())
          ON CONFLICT (item_id) DO UPDATE SET
            match_status = EXCLUDED.match_status,
            enrich_status = EXCLUDED.enrich_status,
            match_confidence = EXCLUDED.match_confidence,
            match_confidence_score = EXCLUDED.match_confidence_score,
            matched_set_code = EXCLUDED.matched_set_code,
            matched_era = EXCLUDED.matched_era,
            parsed_card_no = EXCLUDED.parsed_card_no,
            parsed_number_text = EXCLUDED.parsed_number_text,
            parsed_set_total = EXCLUDED.parsed_set_total,
            match_debug = EXCLUDED.match_debug,
            processing_started_at = NULL,
            updated_at = NOW()
        `,
        [
          row.item_id,
          matchStatus,
          derivedStatus,
          matchConfidenceLabel,
          matchConfidenceScore,
          chosenSetCode || null,
          match.matched_era ||
            row.era ||
            row.pokemon_era ||
            row.attributes?.pokemon_era?.[0] ||
            null,
          parsedCardNo,
          match.parsed_number_text || null,
          match.parsed_total_in_set || match.parsed_set_total || null,
          JSON.stringify(debugPayload)
        ]
      )

      if (matchedCardId) {
        await client.query(
          `
            UPDATE public.auctions
            SET card_id = $1, updated_at = NOW()
            WHERE item_id = $2
          `,
          [matchedCardId, row.item_id]
        )
      }

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
      FROM public.auctions a
      LEFT JOIN public.auction_enrichment ae ON ae.item_id = a.item_id
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
