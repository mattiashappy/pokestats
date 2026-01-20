const { Pool } = require('pg')

const DEFAULT_LIMIT = 50
const DEFAULT_MIN_CONFIDENCE = 0.7
const DEFAULT_MODEL = 'gpt-4o-mini'

function buildPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })
}

function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    dryRun: false,
    minConfidence: DEFAULT_MIN_CONFIDENCE
  }

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (value === '--limit') {
      const next = Number(argv[i + 1])
      if (Number.isFinite(next)) {
        args.limit = next
        i += 1
      }
      continue
    }

    if (value === '--min-confidence') {
      const next = Number(argv[i + 1])
      if (Number.isFinite(next)) {
        args.minConfidence = Math.min(Math.max(next, 0), 1)
        i += 1
      }
    }
  }

  return args
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

async function fetchAuctions(client, limit) {
  const { rows } = await client.query(
    `
      SELECT a.item_id,
             a.title,
             a.thumbnail_url,
             a.image_urls,
             a.pokemon_language,
             a.pokemon_era
      FROM public.tradera_auctions a
      LEFT JOIN public.tradera_auction_pt_card_links l
        ON l.auction_id = a.item_id
      WHERE l.auction_id IS NULL
        AND a.image_urls IS NOT NULL
        AND jsonb_typeof(a.image_urls) = 'array'
        AND jsonb_array_length(a.image_urls) > 0
      ORDER BY a.end_date DESC
      LIMIT $1
    `,
    [limit]
  )

  return rows
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

async function callVisionModel({ imageUrl, model }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const requestBody = {
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
        strict: true,
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
  }

  if (['1', 'true', 'yes'].includes(String(process.env.AI_VISION_LOG_REQUEST || '').toLowerCase())) {
    console.info('Vision request payload:', JSON.stringify(requestBody, null, 2))
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
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

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const { limit, dryRun, minConfidence } = parseArgs(process.argv)
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL

  const pool = buildPool()
  const client = await pool.connect()

  const summary = {
    scanned: 0,
    matched: 0,
    linked: 0,
    skipped: 0,
    skippedReasons: {}
  }

  try {
    const auctions = await fetchAuctions(client, limit)
    summary.scanned = auctions.length

    for (const auction of auctions) {
      const imageUrl = pickBestImageUrl(auction.image_urls)
      if (!imageUrl) {
        summary.skipped += 1
        summary.skippedReasons.missing_image = (summary.skippedReasons.missing_image || 0) + 1
        continue
      }

      let vision
      try {
        vision = await callVisionModel({ imageUrl, model })
      } catch (error) {
        summary.skipped += 1
        summary.skippedReasons.vision_failed = (summary.skippedReasons.vision_failed || 0) + 1
        console.warn(`Vision failed for auction ${auction.item_id}`, error.message)
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
        summary.skippedReasons.no_match = (summary.skippedReasons.no_match || 0) + 1
        console.log(`No match for auction ${auction.item_id}`, {
          cardNumber,
          name,
          setHint
        })
        continue
      }

      summary.matched += 1
      const shouldLink = match.method.startsWith('vision-number') || confidence >= minConfidence

      if (!shouldLink) {
        summary.skipped += 1
        summary.skippedReasons.low_confidence = (summary.skippedReasons.low_confidence || 0) + 1
        console.log(`Low confidence for auction ${auction.item_id}`, {
          confidence,
          method: match.method,
          cardNumber,
          name,
          setHint
        })
        continue
      }

      if (dryRun) {
        console.log(`Dry run link for auction ${auction.item_id}`, {
          pt_card_id: match.card.pt_card_id,
          method: match.method,
          confidence
        })
      } else {
        await upsertLink(client, {
          auctionId: auction.item_id,
          ptCardId: match.card.pt_card_id,
          confidence,
          method: match.method
        })
      }

      summary.linked += 1
    }
  } finally {
    client.release()
    await pool.end()
  }

  console.log('Scan summary', {
    model,
    limit,
    dryRun,
    minConfidence,
    ...summary
  })
}

run().catch((error) => {
  console.error('Scan failed', error)
  process.exit(1)
})
