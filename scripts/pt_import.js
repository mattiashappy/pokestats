const { Pool } = require('pg')

const API_BASE_URL = process.env.PT_API_BASE_URL
const API_KEY = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const API_KEY_HEADER = process.env.PT_API_KEY_HEADER || 'Authorization'
const API_KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer'
const LANGUAGE = process.env.PT_API_LANGUAGE || 'english'
const PAGE_LIMIT = Number(process.env.PT_PAGE_LIMIT || 200)
const SETS_PATH = process.env.PT_SETS_PATH || 'sets'
const CARDS_PATH = process.env.PT_CARDS_PATH || 'cards'
const FALLBACK_PAGINATION = process.env.PT_FALLBACK_PAGINATION === 'true'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

function normalizeBaseUrl(url) {
  const baseUrl = new URL(url)
  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname = `${baseUrl.pathname}/`
  }
  return baseUrl
}

function buildEndpointUrl(path, baseUrl) {
  if (ABSOLUTE_URL_REGEX.test(path)) {
    return new URL(path)
  }

  const normalizedPath = path.replace(/^\/+/, '')
  return new URL(normalizedPath, baseUrl)
}

function normalizeString(value) {
  if (value === undefined || value === null) return null
  const str = String(value).trim()
  return str ? str : null
}

function parseNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseInteger(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.trunc(numeric)
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function parseTimestamp(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  }
  if (API_KEY) {
    headers[API_KEY_HEADER] = API_KEY_PREFIX ? `${API_KEY_PREFIX} ${API_KEY}` : API_KEY
  }
  return headers
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: buildHeaders() })
  const text = await response.text()

  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch (error) {
    console.error('PT fetch failed (non-JSON response)')
    console.error('URL:', url)
    console.error('STATUS:', response.status)
    console.error('CONTENT-TYPE:', response.headers.get('content-type'))
    console.error('BODY (first 300):', text.slice(0, 300).replace(/\s+/g, ' '))
    throw error
  }

  if (!response.ok) {
  const preview = json ? JSON.stringify(json).slice(0, 300) : text.slice(0, 300)
    throw new Error(`Request failed ${response.status}: ${preview}`)
  }
  return json
}

function normalizeResponseList(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key]
    if (Array.isArray(value)) return value
  }
  if (Array.isArray(payload)) return payload
  return []
}

function extractImageField(source, keys) {
  const value = pickFirstValue(source, keys)
  return normalizeString(value)
}

function extractMarketPrice(card) {
  const direct = pickFirstValue(card, ['price_market', 'priceMarket', 'marketPrice', 'market'])
  const numeric = parseNumber(direct)
  if (numeric !== null) return numeric

  const tcgplayer = card?.tcgplayer || card?.tcgPlayer
  const prices = tcgplayer?.prices || card?.prices
  if (!prices || typeof prices !== 'object') return null

  for (const entry of Object.values(prices)) {
    if (!entry || typeof entry !== 'object') continue
    const market = parseNumber(entry.market)
    if (market !== null) return market
  }

  return null
}

function mapSet(set) {
  const images = set?.images || set?.image || {}
  const ptSetId = normalizeString(pickFirstValue(set, ['id', 'setId', 'pt_set_id', 'ptSetId']))

  return {
    ptSetId,
    tcgplayerSetId: normalizeString(pickFirstValue(set, ['tcgplayerSetId', 'tcgPlayerSetId', 'tcgplayer_set_id'])),
    name: normalizeString(set?.name),
    series: normalizeString(set?.series),
    releaseDate: parseDate(pickFirstValue(set, ['releaseDate', 'release_date', 'releasedAt'])),
    cardCount: parseInteger(pickFirstValue(set, ['cardCount', 'card_count', 'printedTotal'])),
    imageCdnUrl: extractImageField(set, ['imageCdnUrl', 'image_cdn_url', 'imageCdn', 'cdnImageUrl']),
    imageCdnUrl200: extractImageField(images, ['imageCdnUrl200', 'small', 'image200', 'url200']),
    imageCdnUrl400: extractImageField(images, ['imageCdnUrl400', 'medium', 'image400', 'url400']),
    imageCdnUrl800: extractImageField(images, ['imageCdnUrl800', 'large', 'image800', 'url800']),
    imageUrl: extractImageField(set, ['imageUrl', 'image_url', 'logo', 'symbol']),
    priceGuideUrl: extractImageField(set, ['priceGuideUrl', 'price_guide_url', 'priceGuide']),
    hasPriceGuide: pickFirstValue(set, ['hasPriceGuide', 'has_price_guide']),
    noPriceGuideReason: normalizeString(pickFirstValue(set, ['noPriceGuideReason', 'no_price_guide_reason'])),
    createdAt: parseTimestamp(pickFirstValue(set, ['createdAt', 'created_at'])),
    updatedAt: parseTimestamp(pickFirstValue(set, ['updatedAt', 'updated_at']))
  }
}

function mapCard(card, fallbackSetName) {
  const images = card?.images || card?.image || {}
  const ptCardId = normalizeString(pickFirstValue(card, ['id', 'cardId', 'pt_card_id', 'ptCardId']))

  return {
    ptCardId,
    tcgplayerProductId: parseInteger(pickFirstValue(card, ['tcgplayerId', 'tcgPlayerId', 'tcgplayer_product_id'])),
    ptSetId: normalizeString(pickFirstValue(card, ['setId', 'pt_set_id', 'ptSetId'])),
    setName: normalizeString(pickFirstValue(card, ['setName', 'set_name'])) || fallbackSetName,
    name: normalizeString(card?.name),
    cardNumber: normalizeString(pickFirstValue(card, ['number', 'cardNumber', 'card_number'])),
    totalSetNumber: normalizeString(pickFirstValue(card, ['total', 'totalSetNumber', 'total_set_number'])),
    rarity: normalizeString(card?.rarity),
    cardType: normalizeString(pickFirstValue(card, ['supertype', 'cardType', 'card_type'])),
    hp: parseInteger(card?.hp),
    stage: normalizeString(pickFirstValue(card, ['subtype', 'stage'])),
    artist: normalizeString(card?.artist),
    tcgplayerUrl: normalizeString(pickFirstValue(card, ['tcgplayerUrl', 'tcgplayer_url', 'tcgPlayerUrl'])),
    imageCdnUrl: extractImageField(card, ['imageCdnUrl', 'image_cdn_url']),
    imageCdnUrl200: extractImageField(images, ['imageCdnUrl200', 'small', 'image200', 'url200']),
    imageCdnUrl400: extractImageField(images, ['imageCdnUrl400', 'medium', 'image400', 'url400']),
    imageCdnUrl800: extractImageField(images, ['imageCdnUrl800', 'large', 'image800', 'url800']),
    priceMarket: extractMarketPrice(card),
    priceListings: parseInteger(pickFirstValue(card, ['priceListings', 'price_listings', 'listings'])),
    pricePrimaryCondition: normalizeString(pickFirstValue(card, ['pricePrimaryCondition', 'price_primary_condition'])),
    pricePrimaryPrinting: normalizeString(pickFirstValue(card, ['pricePrimaryPrinting', 'price_primary_printing'])),
    priceLastUpdated: parseTimestamp(pickFirstValue(card, ['priceLastUpdated', 'price_last_updated'])),
    updatedAt: parseTimestamp(pickFirstValue(card, ['updatedAt', 'updated_at']))
  }
}

async function fetchPagedSets() {
  if (!API_BASE_URL) throw new Error('PT_API_BASE_URL not set')
  const baseUrl = normalizeBaseUrl(API_BASE_URL)
  const limit = Number.isFinite(PAGE_LIMIT) ? Math.max(1, PAGE_LIMIT) : 200
  const allSets = []
  let offset = 0

  while (true) {
    const url = buildEndpointUrl(SETS_PATH, baseUrl)
    url.searchParams.set('language', LANGUAGE)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    if (offset === 0) {
      console.log('FIRST FETCH URL', url.toString())
    }

    const payload = await fetchJson(url)
    const page = normalizeResponseList(payload, ['sets', 'data', 'results', 'items'])

    if (!page.length) break
    allSets.push(...page)

    if (page.length < limit) break
    offset += limit
  }

  return allSets
}

async function fetchPagedCards(setId) {
  const baseUrl = normalizeBaseUrl(API_BASE_URL)
  const limit = Number.isFinite(PAGE_LIMIT) ? Math.max(1, PAGE_LIMIT) : 200
  const allCards = []
  let offset = 0

  while (true) {
    const url = buildEndpointUrl(CARDS_PATH, baseUrl)
    if (setId) url.searchParams.set('setId', setId)
    url.searchParams.set('language', LANGUAGE)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    const payload = await fetchJson(url)
    const page = normalizeResponseList(payload, ['cards', 'data', 'results', 'items'])

    if (!page.length) break
    allCards.push(...page)

    if (page.length < limit) break
    offset += limit
  }

  return allCards
}

async function fetchCardsForSet(setId) {
  if (!API_BASE_URL) throw new Error('PT_API_BASE_URL not set')
  const baseUrl = normalizeBaseUrl(API_BASE_URL)
  const url = buildEndpointUrl(CARDS_PATH, baseUrl)
  if (setId) url.searchParams.set('setId', setId)
  url.searchParams.set('fetchAllInSet', 'true')
  url.searchParams.set('language', LANGUAGE)

  const payload = await fetchJson(url)
  const cards = normalizeResponseList(payload, ['cards', 'data', 'results', 'items'])

  if (!cards.length && FALLBACK_PAGINATION) {
    return fetchPagedCards(setId)
  }

  return cards
}

async function upsertSet(client, set) {
  const values = [
    set.ptSetId,
    set.tcgplayerSetId,
    set.name,
    set.series,
    set.releaseDate,
    set.cardCount,
    set.imageCdnUrl,
    set.imageCdnUrl200,
    set.imageCdnUrl400,
    set.imageCdnUrl800,
    set.imageUrl,
    set.priceGuideUrl,
    set.hasPriceGuide,
    set.noPriceGuideReason,
    set.createdAt,
    set.updatedAt
  ]

  await client.query(
    `
      INSERT INTO public.pt_sets (
        pt_set_id,
        tcgplayer_set_id,
        name,
        series,
        release_date,
        card_count,
        image_cdn_url,
        image_cdn_url200,
        image_cdn_url400,
        image_cdn_url800,
        image_url,
        price_guide_url,
        has_price_guide,
        no_price_guide_reason,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16
      )
      ON CONFLICT (pt_set_id)
      DO UPDATE SET
        tcgplayer_set_id = EXCLUDED.tcgplayer_set_id,
        name = EXCLUDED.name,
        series = EXCLUDED.series,
        release_date = EXCLUDED.release_date,
        card_count = EXCLUDED.card_count,
        image_cdn_url = EXCLUDED.image_cdn_url,
        image_cdn_url200 = EXCLUDED.image_cdn_url200,
        image_cdn_url400 = EXCLUDED.image_cdn_url400,
        image_cdn_url800 = EXCLUDED.image_cdn_url800,
        image_url = EXCLUDED.image_url,
        price_guide_url = EXCLUDED.price_guide_url,
        has_price_guide = EXCLUDED.has_price_guide,
        no_price_guide_reason = EXCLUDED.no_price_guide_reason,
        created_at = COALESCE(EXCLUDED.created_at, public.pt_sets.created_at),
        updated_at = COALESCE(EXCLUDED.updated_at, public.pt_sets.updated_at)
    `,
    values
  )
}

async function upsertCard(client, card) {
  const values = [
    card.ptCardId,
    card.tcgplayerProductId,
    card.ptSetId,
    card.setName,
    card.name,
    card.cardNumber,
    card.totalSetNumber,
    card.rarity,
    card.cardType,
    card.hp,
    card.stage,
    card.artist,
    card.tcgplayerUrl,
    card.imageCdnUrl,
    card.imageCdnUrl200,
    card.imageCdnUrl400,
    card.imageCdnUrl800,
    card.priceMarket,
    card.priceListings,
    card.pricePrimaryCondition,
    card.pricePrimaryPrinting,
    card.priceLastUpdated,
    card.updatedAt
  ]

  if (values.length !== 23) {
    throw new Error(`pt_cards upsert expected 23 values, got ${values.length}`)
  }

  await client.query(
    `
      INSERT INTO public.pt_cards (
        pt_card_id,
        tcgplayer_product_id,
        pt_set_id,
        set_name,
        name,
        card_number,
        total_set_number,
        rarity,
        card_type,
        hp,
        stage,
        artist,
        tcgplayer_url,
        image_cdn_url,
        image_cdn_url200,
        image_cdn_url400,
        image_cdn_url800,
        price_market,
        price_listings,
        price_primary_condition,
        price_primary_printing,
        price_last_updated,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23
      )
      ON CONFLICT (pt_card_id)
      DO UPDATE SET
        tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
        pt_set_id = EXCLUDED.pt_set_id,
        set_name = EXCLUDED.set_name,
        name = EXCLUDED.name,
        card_number = EXCLUDED.card_number,
        total_set_number = EXCLUDED.total_set_number,
        rarity = EXCLUDED.rarity,
        card_type = EXCLUDED.card_type,
        hp = EXCLUDED.hp,
        stage = EXCLUDED.stage,
        artist = EXCLUDED.artist,
        tcgplayer_url = EXCLUDED.tcgplayer_url,
        image_cdn_url = EXCLUDED.image_cdn_url,
        image_cdn_url200 = EXCLUDED.image_cdn_url200,
        image_cdn_url400 = EXCLUDED.image_cdn_url400,
        image_cdn_url800 = EXCLUDED.image_cdn_url800,
        price_market = EXCLUDED.price_market,
        price_listings = EXCLUDED.price_listings,
        price_primary_condition = EXCLUDED.price_primary_condition,
        price_primary_printing = EXCLUDED.price_primary_printing,
        price_last_updated = EXCLUDED.price_last_updated,
        updated_at = COALESCE(EXCLUDED.updated_at, now())
    `,
    values
  )
}

async function importPriceTracker() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL not set')

  console.log({
    API_BASE_URL,
    SETS_PATH,
    CARDS_PATH,
    API_KEY_HEADER,
    API_KEY_PREFIX
  })

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  })

  const sets = await fetchPagedSets()
  const summary = {
    setsReceived: sets.length,
    setsInserted: 0,
    cardsReceived: 0,
    cardsInserted: 0
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const set of sets) {
      const mappedSet = mapSet(set)
      if (!mappedSet.ptSetId || !mappedSet.name) continue
      await upsertSet(client, mappedSet)
      summary.setsInserted += 1

      const cards = await fetchCardsForSet(mappedSet.ptSetId)
      summary.cardsReceived += cards.length

      for (const card of cards) {
        const mappedCard = mapCard(card, mappedSet.name)
        if (!mappedCard.ptCardId || !mappedCard.name) continue
        await upsertCard(client, mappedCard)
        summary.cardsInserted += 1
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  return summary
}

importPriceTracker()
  .then((summary) => {
    console.log('PokemonPriceTracker import complete', summary)
  })
  .catch((error) => {
    console.error('PokemonPriceTracker import failed', error)
    process.exitCode = 1
  })
