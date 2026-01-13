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
        AND table_name = 'tradera_auction_card_links'
    `
  )

  const columnNames = new Set(rows.map((row) => row.column_name))
  const itemColumn = columnNames.has('item_id') ? 'item_id' : columnNames.has('auction_id') ? 'auction_id' : null

  if (!itemColumn) {
    throw new Error('tradera_auction_card_links is missing item_id/auction_id column')
  }

  const timestampColumn = columnNames.has('linked_at') ? 'linked_at' : columnNames.has('created_at') ? 'created_at' : null

  return {
    itemColumn,
    timestampColumn,
    hasMethod: columnNames.has('method'),
    hasStatus: columnNames.has('status')
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

async function fetchCandidateEras(client, title) {
  const tokens = buildNameTokens(title)
  if (!tokens.length) return []

  const clauses = tokens.map((_, index) => `(code ILIKE $${index + 1} OR name ILIKE $${index + 1})`)
  const params = tokens.map((token) => `%${token}%`)

  const { rows } = await client.query(
    `
      SELECT code, name
      FROM public.eras
      WHERE ${clauses.join(' OR ')}
      ORDER BY sort_order NULLS LAST, name
      LIMIT 8
    `,
    params
  )

  return rows
}

async function fetchCandidateExpansions(client, { setHint, title, max = 12 } = {}) {
  const hints = []
  if (setHint) hints.push(setHint)

  const tokens = buildNameTokens(title)
  for (const token of tokens) {
    if (!hints.includes(token)) hints.push(token)
  }

  if (!hints.length) return []

  const clauses = hints.map((_, index) => `(set_code ILIKE $${index + 1} OR set_name ILIKE $${index + 1})`)
  const params = hints.map((hint) => `%${hint}%`)

  const { rows } = await client.query(
    `
      SELECT id, set_code, set_name, era
      FROM public.expansions
      WHERE ${clauses.join(' OR ')}
      ORDER BY set_name
      LIMIT ${Math.max(1, Math.min(max, 40))}
    `,
    params
  )

  return rows
}

async function fetchCandidateCards(client, { collectorKey, title, expansionIds, max = DEFAULT_MAX_CANDIDATES } = {}) {
  const candidates = new Map()

  if (collectorKey) {
    const { rows } = await client.query(
      `
        SELECT c.id,
               c.name,
               c.collector_number_raw,
               c.collector_key,
               e.set_code,
               e.set_name,
               e.era
        FROM public.cards c
        JOIN public.expansions e ON e.id = c.expansion_id
        WHERE c.collector_key = $1 OR c.collector_number_raw = $1
        LIMIT $2
      `,
      [collectorKey, Math.max(1, Math.min(max, 100))]
    )

    for (const row of rows) {
      candidates.set(row.id, row)
    }
  }

  const tokens = buildNameTokens(title)
  if (tokens.length && candidates.size < max) {
    const clauses = tokens.map((_, index) => `c.name ILIKE $${index + 1}`).join(' OR ')
    const params = tokens.map((token) => `${token}%`)

    let expansionFilter = ''
    if (expansionIds && expansionIds.length) {
      expansionFilter = `AND c.expansion_id = ANY($${params.length + 1})`
      params.push(expansionIds)
    }

    const { rows } = await client.query(
      `
        SELECT c.id,
               c.name,
               c.collector_number_raw,
               c.collector_key,
               e.set_code,
               e.set_name,
               e.era
        FROM public.cards c
        JOIN public.expansions e ON e.id = c.expansion_id
        WHERE (${clauses})
        ${expansionFilter}
        ORDER BY c.name
        LIMIT ${Math.max(1, Math.min(max, 100))}
      `,
      params
    )

    for (const row of rows) {
      candidates.set(row.id, row)
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

function buildMatchPrompt({ auction, parsed, eras, expansions, cards }) {
  const systemPrompt = `You match Pokemon auction listings to a single card from the database.
Return JSON with keys: card_id (number or null), confidence (0-1), rationale (string).
Only choose card_id if the auction clearly references a specific card. If uncertain, return null.`

  const payload = {
    auction: {
      title: auction.title || '',
      description: auction.description || ''
    },
    parsed,
    eras,
    expansions,
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

  const cardId = Number(response.card_id)
  return {
    cardId: Number.isFinite(cardId) ? cardId : null,
    confidence: coerceConfidence(response.confidence),
    rationale: typeof response.rationale === 'string' ? response.rationale.trim() : ''
  }
}

async function matchAuction({ client, auction, apiKey, model, confidenceThreshold }) {
  const parsed = parseAuctionTitle(`${auction.title || ''}\n${auction.description || ''}`)

  const [eras, expansions] = await Promise.all([
    fetchCandidateEras(client, auction.title || ''),
    fetchCandidateExpansions(client, { setHint: parsed.setHint, title: auction.title || '' })
  ])

  const expansionIds = expansions.map((expansion) => expansion.id)
  const cards = await fetchCandidateCards(client, {
    collectorKey: parsed.collectorKey?.value || parsed.collectorKey,
    title: auction.title || '',
    expansionIds,
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
    eras,
    expansions,
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

async function matchAuctionsWithAi({ client, limit, apiKey, model } = {}) {
  const safeLimit = clampLimit(limit, DEFAULT_MAX_MATCHES)
  const resolvedModel = model || DEFAULT_MODEL
  const linkColumns = await resolveLinkColumns(client)
  const auctionColumns = await resolveAuctionColumns(client, linkColumns)
  const { rows } = await client.query(
    `
      SELECT a.${auctionColumns.keyColumn} AS auction_key,
             a.${auctionColumns.itemIdColumn} AS item_id,
             a.title,
             a.description
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_card_links l
        ON l.${linkColumns.itemColumn} = a.${auctionColumns.keyColumn}
      WHERE l.${linkColumns.itemColumn} IS NULL
      ORDER BY a.updated_at DESC NULLS LAST, a.${auctionColumns.itemIdColumn} DESC
      LIMIT $1
    `,
    [safeLimit]
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

    const insertColumns = [linkColumns.itemColumn, 'card_id']
    const insertValues = ['$1', '$2']
    const params = [row.auction_key, result.details.cardId]

    if (linkColumns.timestampColumn) {
      insertColumns.push(linkColumns.timestampColumn)
      insertValues.push('NOW()')
    }

    if (linkColumns.hasMethod) {
      insertColumns.push('method')
      params.push('ai')
      insertValues.push(`$${params.length}`)
    }

    if (linkColumns.hasStatus) {
      insertColumns.push('status')
      params.push('linked')
      insertValues.push(`$${params.length}`)
    }

    const updateClauses = ['card_id = EXCLUDED.card_id']

    if (linkColumns.timestampColumn) {
      updateClauses.push(`${linkColumns.timestampColumn} = NOW()`)
    }

    if (linkColumns.hasMethod) {
      updateClauses.push('method = EXCLUDED.method')
    }

    if (linkColumns.hasStatus) {
      updateClauses.push('status = EXCLUDED.status')
    }

    await client.query(
      `
        INSERT INTO public.tradera_auction_card_links (${insertColumns.join(', ')})
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
