const { parseAuctionTitle } = require('../tradera/traderaParser')

const DEFAULT_MODEL = process.env.AI_MATCH_MODEL || 'gpt-4o-mini'
const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.AI_MATCH_CONFIDENCE_THRESHOLD || 0.7)
const DEFAULT_MAX_CANDIDATES = Number(process.env.AI_MATCH_MAX_CANDIDATES || 40)
const DEFAULT_MAX_MATCHES = Number(process.env.AI_MATCH_MAX_MATCHES || 500)

function clampLimit(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildNameTokens(title) {
  const cleaned = normalizeText(title)
    .replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !['pokemon', 'pokémon', 'card', 'cards', 'kort', 'tcg'].includes(token))

  return Array.from(new Set(tokens)).slice(0, 4)
}

function normalizeCollectorPart(value) {
  if (!value) return null
  return String(value).replace(/^0+(?=\d)/, '')
}

function buildCollectorNumberCandidates(collectorKey) {
  if (!collectorKey) return []
  const candidates = new Set()

  if (collectorKey.number) {
    const normalizedNumber = normalizeCollectorPart(collectorKey.number)
    if (normalizedNumber) candidates.add(normalizedNumber)
    if (collectorKey.prefix) {
      candidates.add(`${collectorKey.prefix}${normalizedNumber}`)
    }
  }

  if (collectorKey.value && !collectorKey.value.includes('/')) {
    candidates.add(normalizeCollectorPart(collectorKey.value))
  }

  return Array.from(candidates).filter(Boolean)
}

function coerceConfidence(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(Math.max(numeric, 0), 1)
}

async function resolveLinkColumns(client) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tradera_auction_pt_card_links'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const itemColumn = columnNames.has('item_id') ? 'item_id' : columnNames.has('auction_id') ? 'auction_id' : null

  if (!itemColumn) {
    throw new Error('tradera_auction_pt_card_links is missing item_id/auction_id column')
  }

  const timestampColumn = columnNames.has('matched_at')
    ? 'matched_at'
    : columnNames.has('linked_at')
      ? 'linked_at'
      : columnNames.has('created_at')
        ? 'created_at'
        : null

  const cardColumn = columnNames.has('pt_card_id') ? 'pt_card_id' : columnNames.has('card_id') ? 'card_id' : null

  if (!cardColumn) {
    throw new Error('tradera_auction_pt_card_links is missing pt_card_id/card_id column')
  }

  const methodColumn = columnNames.has('match_method') ? 'match_method' : columnNames.has('method') ? 'method' : null
  const confidenceColumn = columnNames.has('confidence_score')
    ? 'confidence_score'
    : columnNames.has('confidence')
      ? 'confidence'
      : null
  const statusColumn = columnNames.has('status') ? 'status' : null

  return {
    itemColumn,
    timestampColumn,
    cardColumn,
    methodColumn,
    statusColumn,
    confidenceColumn
  }
}

async function resolveAuctionColumns(client, linkColumns) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tradera_auctions'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const keyColumn =
    (linkColumns?.itemColumn && columnNames.has(linkColumns.itemColumn) && linkColumns.itemColumn) ||
    (columnNames.has('item_id') && 'item_id') ||
    (columnNames.has('auction_id') && 'auction_id') ||
    (columnNames.has('id') && 'id') ||
    null

  if (!keyColumn) {
    throw new Error('tradera_auctions is missing an id/auction_id/item_id column')
  }

  const itemIdColumn = columnNames.has('item_id') ? 'item_id' : keyColumn

  return {
    keyColumn,
    itemIdColumn
  }
}

async function fetchCandidateSets(client, { setHint, title, max = 12 } = {}) {
  const hints = []
  if (setHint) hints.push(setHint)

  const tokens = buildNameTokens(title)
  for (const token of tokens) {
    if (!hints.includes(token)) hints.push(token)
  }

  if (!hints.length) return []

  const clauses = hints.map(
    (_, index) => `(name ILIKE $${index + 1} OR series ILIKE $${index + 1} OR pt_set_id ILIKE $${index + 1})`
  )
  const params = hints.map((hint) => `%${hint}%`)

  const { rows } = await client.query(
    `
      SELECT pt_set_id,
             name,
             series,
             card_count
      FROM public.pt_sets
      WHERE ${clauses.join(' OR ')}
      ORDER BY name
      LIMIT ${Math.max(1, Math.min(max, 40))}
    `,
    params
  )

  return rows
}

async function fetchCandidateCards(client, { collectorKey, title, setIds, max = DEFAULT_MAX_CANDIDATES } = {}) {
  const candidates = new Map()
  const numberCandidates = buildCollectorNumberCandidates(collectorKey)

  if (numberCandidates.length) {
    const { rows } = await client.query(
      `
        SELECT c.pt_card_id,
               c.name,
               c.card_number,
               c.total_set_number,
               COALESCE(s.name, c.set_name) AS set_name,
               s.series
        FROM public.pt_cards c
        LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
        WHERE c.card_number = ANY($1)
           OR regexp_replace(c.card_number, '^0+(?=\\d)', '') = ANY($1)
        LIMIT $2
      `,
      [numberCandidates, Math.max(1, Math.min(max, 100))]
    )

    for (const row of rows) {
      candidates.set(row.pt_card_id, row)
    }
  }

  const tokens = buildNameTokens(title)
  if (tokens.length && candidates.size < max) {
    const clauses = tokens.map((_, index) => `c.name ILIKE $${index + 1}`).join(' OR ')
    const params = tokens.map((token) => `${token}%`)

    let setFilter = ''
    if (setIds && setIds.length) {
      setFilter = `AND c.pt_set_id = ANY($${params.length + 1})`
      params.push(setIds)
    }

    const { rows } = await client.query(
      `
        SELECT c.pt_card_id,
               c.name,
               c.card_number,
               c.total_set_number,
               COALESCE(s.name, c.set_name) AS set_name,
               s.series
        FROM public.pt_cards c
        LEFT JOIN public.pt_sets s ON s.pt_set_id = c.pt_set_id
        WHERE (${clauses})
        ${setFilter}
        ORDER BY c.name
        LIMIT ${Math.max(1, Math.min(max, 100))}
      `,
      params
    )

    for (const row of rows) {
      candidates.set(row.pt_card_id, row)
      if (candidates.size >= max) break
    }
  }

  return Array.from(candidates.values()).slice(0, max)
}

async function callOpenAi({ apiKey, model, systemPrompt, userPrompt }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${response.status} ${errorText.slice(0, 300)}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI response missing content')
  }

  return JSON.parse(content)
}

function buildMatchPrompt({ auction, parsed, sets, cards }) {
  const systemPrompt = `You match Pokemon auction listings to a single card from the database.
Return JSON with keys: pt_card_id (string or null), confidence (0-1), rationale (string).
Only choose pt_card_id if the auction clearly references a specific card. If uncertain, return null.`

  const payload = {
    auction: {
      title: auction.title || '',
      description: auction.description || ''
    },
    parsed,
    sets,
    cards
  }

  const userPrompt = `Match this auction to the best card.
Database context and auction data are below as JSON:
${JSON.stringify(payload, null, 2)}`

  return { systemPrompt, userPrompt }
}

function coerceMatchResponse(response) {
  if (!response || typeof response !== 'object') {
    return { cardId: null, confidence: 0, rationale: 'invalid_response' }
  }

  const cardId = response.pt_card_id || response.card_id
  return {
    cardId: typeof cardId === 'string' && cardId.trim() ? cardId.trim() : null,
    confidence: coerceConfidence(response.confidence),
    rationale: typeof response.rationale === 'string' ? response.rationale.trim() : ''
  }
}

async function matchAuction({ client, auction, apiKey, model, confidenceThreshold }) {
  const parsed = parseAuctionTitle(`${auction.title || ''}\n${auction.description || ''}`)

  const sets = await fetchCandidateSets(client, { setHint: parsed.setHint, title: auction.title || '' })
  const setIds = sets.map((set) => set.pt_set_id)
  const cards = await fetchCandidateCards(client, {
    collectorKey: parsed.collectorKey,
    title: auction.title || '',
    setIds,
    max: DEFAULT_MAX_CANDIDATES
  })

  if (!cards.length) {
    return {
      matched: false,
      reason: 'no_candidate_cards',
      details: null
    }
  }

  const { systemPrompt, userPrompt } = buildMatchPrompt({
    auction,
    parsed,
    sets,
    cards
  })

  const rawResponse = await callOpenAi({ apiKey, model, systemPrompt, userPrompt })
  const match = coerceMatchResponse(rawResponse)

  if (!match.cardId || match.confidence < confidenceThreshold) {
    return {
      matched: false,
      reason: 'low_confidence',
      details: match
    }
  }

  return {
    matched: true,
    reason: 'matched',
    details: match
  }
}

async function matchAuctionsWithAi({ client, limit, apiKey, model, itemIds } = {}) {
  const safeLimit = clampLimit(limit, DEFAULT_MAX_MATCHES)
  const resolvedModel = model || DEFAULT_MODEL
  const linkColumns = await resolveLinkColumns(client)
  const auctionColumns = await resolveAuctionColumns(client, linkColumns)
  const normalizedItemIds = Array.isArray(itemIds)
    ? itemIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : []
  const uniqueItemIds = Array.from(new Set(normalizedItemIds))
  const hasItemIds = uniqueItemIds.length > 0
  const params = []
  const whereClauses = [`l.${linkColumns.itemColumn} IS NULL`]

  if (hasItemIds) {
    params.push(uniqueItemIds)
    whereClauses.push(`a.${auctionColumns.itemIdColumn} = ANY($${params.length})`)
  }

  if (!hasItemIds) {
    params.push(safeLimit)
  }

  const limitClause = hasItemIds ? '' : `LIMIT $${params.length}`

  const { rows } = await client.query(
    `
      SELECT a.${auctionColumns.keyColumn} AS auction_key,
             a.${auctionColumns.itemIdColumn} AS item_id,
             a.title,
             a.description
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_pt_card_links l
        ON l.${linkColumns.itemColumn} = a.${auctionColumns.keyColumn}
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.updated_at DESC NULLS LAST, a.${auctionColumns.itemIdColumn} DESC
      ${limitClause}
    `,
    params
  )

  const summary = {
    scanned: rows.length,
    matched: 0,
    skipped: 0,
    skipReasons: {},
    matchedExamples: []
  }

  const confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD

  for (const row of rows) {
    const result = await matchAuction({
      client,
      auction: row,
      apiKey,
      model: resolvedModel,
      confidenceThreshold
    })

    if (!result.matched) {
      summary.skipped += 1
      summary.skipReasons[result.reason] = (summary.skipReasons[result.reason] || 0) + 1
      continue
    }

    const insertColumns = [linkColumns.itemColumn, linkColumns.cardColumn]
    const insertValues = ['$1', '$2']
    const params = [row.auction_key, result.details.cardId]

    if (linkColumns.timestampColumn) {
      insertColumns.push(linkColumns.timestampColumn)
      insertValues.push('NOW()')
    }

    if (linkColumns.methodColumn) {
      insertColumns.push(linkColumns.methodColumn)
      params.push('ai')
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.confidenceColumn) {
      insertColumns.push(linkColumns.confidenceColumn)
      params.push(result.details.confidence)
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.statusColumn) {
      insertColumns.push(linkColumns.statusColumn)
      params.push('linked')
      insertValues.push(`$${params.length}`)
    }

    const updateClauses = [`${linkColumns.cardColumn} = EXCLUDED.${linkColumns.cardColumn}`]

    if (linkColumns.timestampColumn) {
      updateClauses.push(`${linkColumns.timestampColumn} = NOW()`)
    }

    if (linkColumns.methodColumn) {
      updateClauses.push(`${linkColumns.methodColumn} = EXCLUDED.${linkColumns.methodColumn}`)
    }

    if (linkColumns.confidenceColumn) {
      updateClauses.push(`${linkColumns.confidenceColumn} = EXCLUDED.${linkColumns.confidenceColumn}`)
    }

    if (linkColumns.statusColumn) {
      updateClauses.push(`${linkColumns.statusColumn} = EXCLUDED.${linkColumns.statusColumn}`)
    }

    await client.query(
      `
        INSERT INTO public.tradera_auction_pt_card_links (${insertColumns.join(', ')})
        VALUES (${insertValues.join(', ')})
        ON CONFLICT (${linkColumns.itemColumn}) DO UPDATE SET
          ${updateClauses.join(',\n          ')}
      `,
      params
    )

    summary.matched += 1
    if (summary.matchedExamples.length < 20) {
      summary.matchedExamples.push({
        itemId: row.item_id,
        title: row.title ?? null,
        cardId: result.details.cardId,
        confidence: result.details.confidence,
        rationale: result.details.rationale || null
      })
    }
  }

  return summary
}

module.exports = {
  matchAuctionsWithAi,
  DEFAULT_MODEL
}
