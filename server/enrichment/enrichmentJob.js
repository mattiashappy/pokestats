const { resolveAuctionMatch } = require('./numberFirstMatcher')
const { loadCatalog } = require('../catalog/catalogLoader')

const STAGE_SEQUENCE = ['era', 'set', 'number', 'name', 'ready_to_link', 'linked']

function nextStage(current) {
  const idx = STAGE_SEQUENCE.indexOf(current)
  if (idx === -1) return null
  return STAGE_SEQUENCE[Math.min(idx + 1, STAGE_SEQUENCE.length - 1)]
}

function normalizeSetCode(setCode) {
  return setCode ? String(setCode).trim().toUpperCase() : null
}

async function getCatalog() {
  const { expansions, cardsBySetCode } = await loadCatalog()
  const eraBySetCode = new Map()

  for (const expansion of expansions || []) {
    if (expansion.set_code) {
      eraBySetCode.set(normalizeSetCode(expansion.set_code), expansion.era || null)
    }
  }

  return { expansions, cardsBySetCode, eraBySetCode }
}

function pickMatchedEra(match, row, eraBySetCode) {
  const fromMatch = match?.matched_era || null
  if (fromMatch) return fromMatch

  const setCode = normalizeSetCode(match?.matched_set_code || match?.parsed_set_guess)
  if (setCode && eraBySetCode.has(setCode)) return eraBySetCode.get(setCode)

  return row?.raw?.pokemon_era || row?.raw?.era || null
}

function parseCardNumberText(match) {
  const numberText = match?.parsed_number_text || null
  if (numberText) return numberText

  const numeric = match?.parsed_card_number
  return numeric != null ? String(numeric) : null
}

function deriveParsedName(match) {
  return match?.parsed_name || match?.parsed_card_name || null
}

async function selectQueue(client, stage, limit) {
  const whereByStage = {
    era: `a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NULL`,
    set: `a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NOT NULL AND e.matched_set_code IS NULL`,
    number:
      "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_set_code IS NOT NULL AND e.parsed_card_number IS NULL",
    name:
      "a.card_id IS NULL AND e.status <> 'discarded' AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NULL",
    ready_to_link:
      "a.card_id IS NULL AND e.status <> 'discarded' AND e.matched_era IS NOT NULL AND e.matched_set_code IS NOT NULL " +
      "AND e.parsed_card_number IS NOT NULL AND e.parsed_card_name IS NOT NULL"
  }

  const where = whereByStage[stage]
  if (!where) return []

  const { rows } = await client.query(
    `
      SELECT a.item_id, a.title, a.raw, a.card_id, a.end_date, e.*
      FROM public.auctions a
      JOIN public.auction_enrichment e ON e.item_id = a.item_id
      WHERE ${where}
      ORDER BY a.end_date DESC
      LIMIT $1
    `,
    [limit]
  )

  return rows
}

async function ensureStageDefaults(client) {
  await client.query(
    `UPDATE public.auction_enrichment SET stage = 'era' WHERE stage IS NULL OR stage = ''`
  )
}

async function enrichEra(client, catalog, limit) {
  const queue = await selectQueue(client, 'era', limit)
  let updated = 0
  let needsReview = 0

  for (const row of queue) {
    const match = await resolveAuctionMatch(client, row, catalog.expansions, catalog.cardsBySetCode)
    const matchedEra = pickMatchedEra(match, row, catalog.eraBySetCode)

    if (!matchedEra) {
      await client.query(
        `UPDATE public.auction_enrichment SET status = 'needs_review', stage = 'era', updated_at = NOW() WHERE item_id = $1`,
        [row.item_id]
      )
      needsReview++
      continue
    }

    await client.query(
      `
        UPDATE public.auction_enrichment
        SET matched_era = $1, stage = $2, status = CASE WHEN status = 'discarded' THEN status ELSE 'unmatched' END, updated_at = NOW()
        WHERE item_id = $3
      `,
      [matchedEra, 'set', row.item_id]
    )
    updated++
  }

  return { attempted: queue.length, updated, needs_review: needsReview }
}

async function enrichSet(client, catalog, limit) {
  const queue = await selectQueue(client, 'set', limit)
  let updated = 0
  let needsReview = 0

  for (const row of queue) {
    const match = await resolveAuctionMatch(client, row, catalog.expansions, catalog.cardsBySetCode)
    const setCode = normalizeSetCode(match?.matched_set_code || match?.parsed_set_guess)

    if (!setCode) {
      await client.query(
        `UPDATE public.auction_enrichment SET status = 'needs_review', stage = 'set', updated_at = NOW() WHERE item_id = $1`,
        [row.item_id]
      )
      needsReview++
      continue
    }

    await client.query(
      `
        UPDATE public.auction_enrichment
        SET matched_set_code = $1, stage = $2, method = COALESCE(method, $3), updated_at = NOW(),
            status = CASE WHEN status = 'discarded' THEN status ELSE 'unmatched' END
        WHERE item_id = $4
      `,
      [setCode, 'number', match?.match_method || match?.method || null, row.item_id]
    )
    updated++
  }

  return { attempted: queue.length, updated, needs_review: needsReview }
}

async function enrichNumber(client, catalog, limit) {
  const queue = await selectQueue(client, 'number', limit)
  let updated = 0
  let needsReview = 0

  for (const row of queue) {
    const match = await resolveAuctionMatch(client, row, catalog.expansions, catalog.cardsBySetCode)
    const parsedNumber = match?.parsed_card_number ?? match?.parsed_card_no ?? null
    const numberText = parseCardNumberText(match)

    if (parsedNumber == null) {
      await client.query(
        `UPDATE public.auction_enrichment SET status = 'needs_review', stage = 'number', updated_at = NOW() WHERE item_id = $1`,
        [row.item_id]
      )
      needsReview++
      continue
    }

    await client.query(
      `
        UPDATE public.auction_enrichment
        SET parsed_card_number = $1, parsed_number_text = $2, parsed_set_hint = COALESCE($3, parsed_set_hint),
            parsed_set_candidates = COALESCE($4, parsed_set_candidates), stage = $5,
            status = CASE WHEN status = 'discarded' THEN status ELSE 'unmatched' END, updated_at = NOW()
        WHERE item_id = $6
      `,
      [
        String(parsedNumber),
        numberText,
        match?.parsed_set_hint || null,
        match?.parsed_set_candidates ? JSON.stringify(match.parsed_set_candidates) : null,
        'name',
        row.item_id
      ]
    )
    updated++
  }

  return { attempted: queue.length, updated, needs_review: needsReview }
}

async function enrichName(client, catalog, limit) {
  const queue = await selectQueue(client, 'name', limit)
  let updated = 0
  let needsReview = 0

  for (const row of queue) {
    const match = await resolveAuctionMatch(client, row, catalog.expansions, catalog.cardsBySetCode)
    const parsedName = deriveParsedName(match)

    if (!parsedName) {
      await client.query(
        `UPDATE public.auction_enrichment SET status = 'needs_review', stage = 'name', updated_at = NOW() WHERE item_id = $1`,
        [row.item_id]
      )
      needsReview++
      continue
    }

    await client.query(
      `
        UPDATE public.auction_enrichment
        SET parsed_card_name = $1, stage = $2, status = CASE WHEN status = 'discarded' THEN status ELSE 'unmatched' END,
            updated_at = NOW()
        WHERE item_id = $3
      `,
      [parsedName, 'ready_to_link', row.item_id]
    )
    updated++
  }

  return { attempted: queue.length, updated, needs_review: needsReview }
}

async function linkReady(client, catalog, limit) {
  const queue = await selectQueue(client, 'ready_to_link', limit)
  let linked = 0
  let needsReview = 0

  for (const row of queue) {
    const setCode = normalizeSetCode(row.matched_set_code)
    const cardNumber = row.parsed_card_number

    if (!setCode || cardNumber == null) {
      await client.query(
        `UPDATE public.auction_enrichment SET status = 'needs_review', stage = 'ready_to_link', updated_at = NOW() WHERE item_id = $1`,
        [row.item_id]
      )
      needsReview++
      continue
    }

    const { rows: candidates } = await client.query(
      `SELECT id FROM public.cards WHERE UPPER(set_code) = $1 AND card_number = $2`,
      [setCode, String(cardNumber)]
    )

    if (candidates.length === 1) {
      const cardId = candidates[0].id
      await client.query('BEGIN')
      try {
        await client.query(`UPDATE public.auctions SET card_id = $1, updated_at = NOW() WHERE item_id = $2`, [cardId, row.item_id])
        await client.query(
          `
            UPDATE public.auction_enrichment
            SET status = 'matched', stage = 'linked', method = COALESCE(method, 'strict_link'), updated_at = NOW()
            WHERE item_id = $1
          `,
          [row.item_id]
        )
        await client.query('COMMIT')
        linked++
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      continue
    }

    await client.query(
      `
        UPDATE public.auction_enrichment
        SET status = 'needs_review', stage = 'ready_to_link', suggested_cards = $1, updated_at = NOW()
        WHERE item_id = $2
      `,
      [candidates.length ? JSON.stringify(candidates) : null, row.item_id]
    )
    needsReview++
  }

  return { attempted: queue.length, linked, needs_review: needsReview }
}

async function runStage(pool, stage, limit = 100) {
  if (!pool) throw new Error('DATABASE_URL not set')

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000)
  const client = await pool.connect()

  try {
    await ensureStageDefaults(client)
    const catalog = await getCatalog()

    switch (stage) {
      case 'era':
        return { stage, ...(await enrichEra(client, catalog, safeLimit)) }
      case 'set':
        return { stage, ...(await enrichSet(client, catalog, safeLimit)) }
      case 'number':
        return { stage, ...(await enrichNumber(client, catalog, safeLimit)) }
      case 'name':
        return { stage, ...(await enrichName(client, catalog, safeLimit)) }
      case 'link':
      case 'ready_to_link':
        return { stage: 'link', ...(await linkReady(client, catalog, safeLimit)) }
      default:
        throw new Error(`Unknown stage: ${stage}`)
    }
  } finally {
    client.release()
  }
}

async function runFullPipeline(pool, limitPerStage = 100) {
  const stages = ['era', 'set', 'number', 'name', 'link']
  const results = []

  for (const stage of stages) {
    const result = await runStage(pool, stage, limitPerStage)
    results.push(result)
  }

  return { ok: true, stages: results }
}

module.exports = {
  runStage,
  runFullPipeline,
  enrichEra,
  enrichSet,
  enrichNumber,
  enrichName,
  linkReady
}
