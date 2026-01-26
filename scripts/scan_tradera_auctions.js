const { Pool } = require('pg')
const fetch = require('node-fetch') // Ensure you have node-fetch or use Node 18+ native fetch

const DEFAULT_LIMIT = 50
const DEFAULT_MIN_CONFIDENCE = 0.7
// Using the latest production version of 1.5 Pro
const DEFAULT_MODEL = 'gemini-1.5-pro-002'

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

// Gemini requires base64 image data, it cannot fetch URLs directly from the prompt
async function fetchImageAsBase64(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer).toString('base64')
}

// Helper to determine mime type roughly from url or default to jpeg
function getMimeType(url) {
  if (url.toLowerCase().endsWith('.png')) return 'image/png'
  if (url.toLowerCase().endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function callVisionModel({ imageUrl, model }) {
  // 1. Get API Key
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  // 2. Download and prepare Image
  const base64Image = await fetchImageAsBase64(imageUrl)
  const mimeType = getMimeType(imageUrl)

  // 3. Define the Schema (Strict JSON Output)
  const schema = {
    type: "OBJECT",
    properties: {
      card_number: { type: "STRING", description: "The exact printed collector number like '197/193'" },
      name: { type: "STRING", description: "The printed card name" },
      set_name_hint: { type: "STRING", description: "A hint for the set name found on the card, or null", nullable: true },
      language: { type: "STRING", description: "The language of the card (English, Japanese, etc)" },
      confidence: { type: "NUMBER", description: "Confidence score between 0 and 1" }
    },
    required: ["card_number", "name", "set_name_hint", "language", "confidence"]
  }

  const requestBody = {
    contents: [{
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
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: schema,
      temperature: 0.1 // Low temperature for factual extraction
    }
  }

  if (['1', 'true', 'yes'].includes(String(process.env.AI_VISION_LOG_REQUEST || '').toLowerCase())) {
    console.info('Vision request model:', model)
  }

  // 4. Call Gemini API
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

  // 5. Parse Response
  try {
    const textResponse = payload.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textResponse) throw new Error('Empty response from Gemini')
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

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const { limit, dryRun, minConfidence } = parseArgs(process.argv)
  // Fallback to Gemini Pro 1.5 if env var not set
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL

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
