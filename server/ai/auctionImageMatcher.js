const DEFAULT_MODEL = process.env.AI_VISION_MODEL || 'gpt-4o-mini'
const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.AI_VISION_CONFIDENCE_THRESHOLD || 0.7)
const DEFAULT_MAX_MATCHES = Number(process.env.AI_VISION_MAX_MATCHES || 200)

function clampLimit(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(Math.max(numeric, 1), 5000)
}

function normalizeText(value) {
  if (!value) return ''
  return String(value).trim()
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function pickBestImageUrl(imageUrls) {
  if (!imageUrls) return null
  const list = Array.isArray(imageUrls) ? imageUrls : (() => {
    try {
      return JSON.parse(imageUrls)
    } catch (error) {
      return []
    }
  })()

  const urls = list.filter((entry) => typeof entry === 'string' && entry.trim().length)
  if (!urls.length) return null

  const scored = urls.map((url) => {
    let score = 0
    if (url.includes('/images/')) score += 3
    if (url.includes('/medium/')) score += 2
    if (url.toLowerCase().includes('large')) score += 2
    if (url.toLowerCase().includes('medium')) score += 1
    if (url.toLowerCase().includes('thumb')) score -= 1
    score += Math.min(url.length / 100, 1)
    return { url, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.url ?? null
}

function buildVisionPrompt() {
  return [
    'You are extracting printed details from a Pokémon TCG card listing image.',
    'Return JSON ONLY with these fields:',
    '- card_number (string, exact printed collector number like "197/193")',
    '- name (string, printed card name)',
    '- set_name_hint (string or null)',
    '- language (string, use values like English, Japanese, Swedish, Unknown)',
    '- confidence (number 0-1)',
    'Prioritize the collector number as the most authoritative identifier.'
  ].join('\n')
}

function extractResponseText(payload) {
  if (payload.output_text) return payload.output_text
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!item?.content) continue
      for (const content of item.content) {
        if (content.type === 'output_text' || content.type === 'text') {
          return content.text
        }
      }
    }
  }
  return null
}

function safeParseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch (parseError) {
      return null
    }
  }
}

async function callVisionModel({ apiKey, model, imageUrl }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: buildVisionPrompt() },
            { type: 'input_image', image_url: imageUrl }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'vision_card_extract',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              card_number: { type: 'string' },
              name: { type: 'string' },
              set_name_hint: { type: ['string', 'null'] },
              language: { type: 'string' },
              confidence: { type: 'number' }
            },
            required: ['card_number', 'name', 'set_name_hint', 'language', 'confidence']
          }
        }
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`)
  }

  const payload = await response.json()
  const outputText = extractResponseText(payload)
  const parsed = safeParseJson(outputText)

  if (!parsed) {
    throw new Error(`Unable to parse model response: ${outputText || 'empty response'}`)
  }

  return parsed
}

function normalizeCardNumber(cardNumber) {
  if (!cardNumber) return null
  return normalizeText(cardNumber)
}

function filterMatchesBySetName(matches, setHint) {
  if (!setHint) return matches
  const hint = setHint.toLowerCase()
  return matches.filter((match) => String(match.set_name || '').toLowerCase().includes(hint))
}

function filterMatchesByName(matches, name) {
  if (!name) return matches
  const normalized = normalizeName(name)
  if (!normalized) return matches
  return matches.filter((match) => normalizeName(match.name).includes(normalized))
}

async function matchPtCard(client, { cardNumber, setHint, name }) {
  if (cardNumber) {
    const { rows } = await client.query(
      `
        SELECT pt_card_id, name, set_name, card_number
        FROM public.pt_cards
        WHERE card_number = $1
        LIMIT 20
      `,
      [cardNumber]
    )

    if (rows.length === 1) {
      return { card: rows[0], method: 'vision-number-exact' }
    }

    if (rows.length > 1) {
      const setMatches = filterMatchesBySetName(rows, setHint)
      if (setMatches.length === 1) {
        return { card: setMatches[0], method: 'vision-number+set' }
      }

      const nameMatches = filterMatchesByName(setMatches.length ? setMatches : rows, name)
      if (nameMatches.length === 1) {
        return { card: nameMatches[0], method: 'vision-number+name' }
      }
    }
  }

  if (name) {
    const nameParam = `%${normalizeText(name)}%`
    const { rows } = await client.query(
      `
        SELECT pt_card_id, name, set_name, card_number
        FROM public.pt_cards
        WHERE name ILIKE $1
        ORDER BY set_name
        LIMIT 20
      `,
      [nameParam]
    )

    if (rows.length === 1) {
      return { card: rows[0], method: 'vision-name-fuzzy' }
    }

    const setMatches = filterMatchesBySetName(rows, setHint)
    if (setMatches.length === 1) {
      return { card: setMatches[0], method: 'vision-name+set' }
    }
  }

  return null
}

async function upsertLink(client, { auctionId, ptCardId, confidence, method }) {
  await client.query(
    `
      INSERT INTO public.tradera_auction_pt_card_links
        (auction_id, pt_card_id, confidence, method)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auction_id) DO UPDATE
      SET pt_card_id = EXCLUDED.pt_card_id,
          confidence = EXCLUDED.confidence,
          method = EXCLUDED.method
    `,
    [auctionId, ptCardId, confidence, method]
  )
}

async function matchAuctionsWithVision({ client, apiKey, model, itemIds, minConfidence } = {}) {
  const resolvedModel = model || DEFAULT_MODEL
  const confidenceThreshold = Number.isFinite(Number(minConfidence))
    ? Math.min(Math.max(Number(minConfidence), 0), 1)
    : DEFAULT_CONFIDENCE_THRESHOLD
  const normalizedItemIds = Array.isArray(itemIds)
    ? itemIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : []
  const uniqueItemIds = Array.from(new Set(normalizedItemIds))
  const safeLimit = clampLimit(uniqueItemIds.length ? uniqueItemIds.length : DEFAULT_MAX_MATCHES, DEFAULT_MAX_MATCHES)
  const params = []
  const whereClauses = [
    'l.auction_id IS NULL',
    "a.image_urls IS NOT NULL",
    "jsonb_typeof(a.image_urls) = 'array'",
    'jsonb_array_length(a.image_urls) > 0'
  ]

  if (uniqueItemIds.length) {
    params.push(uniqueItemIds)
    whereClauses.push(`a.item_id = ANY($${params.length})`)
  } else {
    params.push(safeLimit)
  }

  const limitClause = uniqueItemIds.length ? '' : `LIMIT $${params.length}`

  const { rows } = await client.query(
    `
      SELECT a.item_id,
             a.title,
             a.image_urls
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_pt_card_links l ON l.auction_id = a.item_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.end_date DESC
      ${limitClause}
    `,
    params
  )

  const summary = {
    scanned: rows.length,
    matched: 0,
    linked: 0,
    skipped: 0,
    skipReasons: {},
    matchedExamples: [],
    logs: []
  }

  for (const row of rows) {
    summary.logs.push({
      itemId: row.item_id,
      stage: 'start',
      message: 'Starting image enrichment'
    })

    const imageUrl = pickBestImageUrl(row.image_urls)
    if (!imageUrl) {
      summary.skipped += 1
      summary.skipReasons.missing_image = (summary.skipReasons.missing_image || 0) + 1
      summary.logs.push({
        itemId: row.item_id,
        stage: 'image',
        message: 'No usable image URLs found'
      })
      continue
    }

    summary.logs.push({
      itemId: row.item_id,
      stage: 'image',
      message: 'Selected image URL',
      data: { imageUrl }
    })

    let vision
    try {
      vision = await callVisionModel({ apiKey, model: resolvedModel, imageUrl })
      summary.logs.push({
        itemId: row.item_id,
        stage: 'vision',
        message: 'Vision response parsed',
        data: vision
      })
    } catch (error) {
      summary.skipped += 1
      summary.skipReasons.vision_failed = (summary.skipReasons.vision_failed || 0) + 1
      summary.logs.push({
        itemId: row.item_id,
        stage: 'vision',
        message: 'Vision request failed',
        data: { error: error.message }
      })
      continue
    }

    const cardNumber = normalizeCardNumber(vision.card_number)
    const setHint = normalizeText(vision.set_name_hint)
    const name = normalizeText(vision.name)
    const confidence = Number.isFinite(Number(vision.confidence))
      ? Math.min(Math.max(Number(vision.confidence), 0), 1)
      : 0

    const match = await matchPtCard(client, { cardNumber, setHint, name })
    if (!match) {
      summary.skipped += 1
      summary.skipReasons.no_match = (summary.skipReasons.no_match || 0) + 1
      summary.logs.push({
        itemId: row.item_id,
        stage: 'match',
        message: 'No PT card match found',
        data: { cardNumber, name, setHint }
      })
      continue
    }

    summary.matched += 1
    summary.logs.push({
      itemId: row.item_id,
      stage: 'match',
      message: 'Matched PT card candidate',
      data: { ptCardId: match.card.pt_card_id, method: match.method }
    })

    const shouldLink = match.method.startsWith('vision-number') || confidence >= confidenceThreshold
    if (!shouldLink) {
      summary.skipped += 1
      summary.skipReasons.low_confidence = (summary.skipReasons.low_confidence || 0) + 1
      summary.logs.push({
        itemId: row.item_id,
        stage: 'decision',
        message: 'Skipped due to low confidence',
        data: { confidence, threshold: confidenceThreshold, method: match.method }
      })
      continue
    }

    await upsertLink(client, {
      auctionId: row.item_id,
      ptCardId: match.card.pt_card_id,
      confidence,
      method: match.method
    })

    summary.linked += 1
    if (summary.matchedExamples.length < 20) {
      summary.matchedExamples.push({
        itemId: row.item_id,
        title: row.title ?? null,
        cardId: match.card.pt_card_id,
        confidence,
        method: match.method
      })
    }

    summary.logs.push({
      itemId: row.item_id,
      stage: 'linked',
      message: 'Link upserted',
      data: { ptCardId: match.card.pt_card_id, confidence, method: match.method }
    })
  }

  return summary
}

module.exports = {
  matchAuctionsWithVision,
  DEFAULT_MODEL
}
