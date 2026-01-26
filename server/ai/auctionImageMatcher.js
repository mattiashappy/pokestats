const DEFAULT_MODEL = process.env.AI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-pro-002'
const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.AI_VISION_CONFIDENCE_THRESHOLD || 0.7)
const DEFAULT_MAX_MATCHES = Number(process.env.AI_VISION_MAX_MATCHES || 200)
const SHOULD_LOG_VISION_REQUEST = ['1', 'true', 'yes'].includes(
  String(process.env.AI_VISION_LOG_REQUEST || '').toLowerCase()
)

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

async function fetchImageAsBase64(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer).toString('base64')
}

function getMimeType(url) {
  if (url.toLowerCase().endsWith('.png')) return 'image/png'
  if (url.toLowerCase().endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function callVisionModel({ apiKey, model, imageUrl }) {
  const base64Image = await fetchImageAsBase64(imageUrl)
  const mimeType = getMimeType(imageUrl)
  const schema = {
    type: 'OBJECT',
    properties: {
      card_number: { type: 'STRING', description: "The exact printed collector number like '197/193'" },
      name: { type: 'STRING', description: 'The printed card name' },
      set_name_hint: { type: 'STRING', description: 'A hint for the set name found on the card, or null', nullable: true },
      language: { type: 'STRING', description: 'The language of the card (English, Japanese, etc)' },
      confidence: { type: 'NUMBER', description: 'Confidence score between 0 and 1' }
    },
    required: ['card_number', 'name', 'set_name_hint', 'language', 'confidence']
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are extracting printed details from a Pokémon TCG card listing image.
Prioritize the collector number as the most authoritative identifier.`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: schema,
      temperature: 0.1
    }
  }

  if (SHOULD_LOG_VISION_REQUEST) {
    console.info('Vision request model:', model)
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errorText}`)
  }

  const payload = await response.json()
  const textResponse = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textResponse) {
    throw new Error('Empty response from Gemini')
  }

  try {
    return JSON.parse(textResponse)
  } catch (error) {
    console.error('Failed to parse Gemini response:', JSON.stringify(payload, null, 2))
    throw error
  }
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

function isNameCompatible(cardName, extractedName) {
  if (!extractedName) return true
  const normalizedExtracted = normalizeName(extractedName)
  if (!normalizedExtracted) return true
  const normalizedCard = normalizeName(cardName)
  return normalizedCard.includes(normalizedExtracted) || normalizedExtracted.includes(normalizedCard)
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
      if (isNameCompatible(rows[0].name, name)) {
        return { card: rows[0], method: 'vision-number-exact' }
      }
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
