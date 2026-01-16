const crypto = require('crypto')
const { Pool } = require('pg')

const PRICE_TRACKER_BASE_URL =
  process.env.PT_API_BASE_URL ||
  process.env.PRICE_TRACKER_BASE_URL ||
  'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN =
  process.env.PT_API_TOKEN ||
  process.env.PT_API_KEY ||
  process.env.PRICE_TRACKER_TOKEN ||
  process.env.PRICE_TRACKER_API_KEY
const DATABASE_URL = process.env.DATABASE_URL

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

function normalizeString(value) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function normalizeNumericId(value) {
  const normalized = normalizeSetValue(value)
  if (normalized === null) return null
  const str = String(normalized).trim()
  if (!/^\d+$/.test(str)) return normalized
  return Number(str)
}

function withLineNumbers(text) {
  return text
    .split('\n')
    .map((line, i) => String(i + 1).padStart(3, ' ') + ' | ' + line)
    .join('\n')
}

function countPlaceholders(sql) {
  const matches = sql.match(/\$\d+/g) || []
  // Unique placeholders ($1..$23). If someone duplicated $23 or skipped $14,
  // we still want to know.
  const unique = new Set(matches)
  return { total: matches.length, uniqueCount: unique.size, unique: [...unique].sort() }
}

function countInsertColumns(sql) {
  // Extract the column list between "INSERT INTO ... (" and ") VALUES"
  // This is safe here because our column list contains only identifiers.
  const m = sql.match(/INSERT\s+INTO\s+public\.pt_cards\s*\(([\s\S]*?)\)\s*VALUES/i)
  if (!m) return 0
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length
}

function buildPriceTrackerUrl(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    url.searchParams.set(key, String(value))
  })
  return url
}

async function fetchPriceTracker(endpoint, params = {}) {
  if (!PRICE_TRACKER_TOKEN) {
    throw new Error('Price Tracker token not set')
  }

  const url = buildPriceTrackerUrl(endpoint, params)
  console.log('PT_FETCH_URL', url.toString())
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PRICE_TRACKER_TOKEN}`
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Price Tracker request failed (${response.status}): ${body}`)
  }

  return response.json()
}

function normalizePriceTrackerData(payload) {
  const data = payload?.data ?? null
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

async function fetchPaged(endpoint, params = {}, { limit = 100, offset = 0, maxPages = 1000 } = {}) {
  const items = []
  let page = 0
  let currentOffset = offset

  while (page < maxPages) {
    const payload = await fetchPriceTracker(endpoint, { ...params, limit, offset: currentOffset })
    const pageItems = normalizePriceTrackerData(payload)
    if (!pageItems.length) break
    items.push(...pageItems)

    if (pageItems.length < limit) break

    currentOffset += limit
    page += 1
  }

  return items
}

function normalizeSetValue(value) {
  if (value === undefined) return null
  if (value === '') return null
  return value ?? null
}

function mapPriceTrackerSet(set) {
  const ptSetId = normalizeSetValue(set?.id ?? set?.ptSetId ?? set?.setId)
  const tcgplayerSetId = normalizeNumericId(
    set?.tcgPlayerId ?? set?.tcgplayerSetId ?? set?.tcgplayer_set_id
  )
  const ptSetSlug = normalizeString(set?.tcgPlayerId ?? set?.tcgplayerSetId ?? set?.tcgplayer_set_id ?? set?.slug)
  const name = normalizeSetValue(set?.name ?? set?.setName)
  const series = normalizeSetValue(set?.series)
  const releaseDate = normalizeSetValue(set?.releaseDate ?? set?.release_date)
  const cardCount = normalizeSetValue(set?.cardCount ?? set?.totalSetNumber ?? set?.totalCards)
  const imageCdnUrl = normalizeSetValue(set?.imageCdnUrl ?? set?.image_cdn_url)
  const imageCdnUrl200 = normalizeSetValue(set?.imageCdnUrl200 ?? set?.image_cdn_url200)
  const imageCdnUrl400 = normalizeSetValue(set?.imageCdnUrl400 ?? set?.image_cdn_url400)
  const imageCdnUrl800 = normalizeSetValue(set?.imageCdnUrl800 ?? set?.image_cdn_url800)
  const imageUrl = normalizeSetValue(set?.imageUrl ?? set?.image_url)
  const priceGuideUrl = normalizeSetValue(set?.priceGuideUrl ?? set?.price_guide_url)
  const hasPriceGuide =
    typeof set?.hasPriceGuide === 'boolean' ? set.hasPriceGuide : normalizeSetValue(set?.has_price_guide)
  const noPriceGuideReason = normalizeSetValue(set?.noPriceGuideReason ?? set?.no_price_guide_reason)
  const createdAt = normalizeSetValue(set?.createdAt ?? set?.created_at)
  const updatedAt = normalizeSetValue(set?.updatedAt ?? set?.updated_at)

  return {
    ptSetId,
    tcgplayerSetId,
    ptSetSlug,
    name,
    series,
    releaseDate,
    cardCount,
    imageCdnUrl,
    imageCdnUrl200,
    imageCdnUrl400,
    imageCdnUrl800,
    imageUrl,
    priceGuideUrl,
    hasPriceGuide,
    noPriceGuideReason,
    createdAt,
    updatedAt
  }
}

function mapPriceTrackerCard(card, setOverride = null) {
  const ptCardId = normalizeSetValue(card?.id ?? card?.ptCardId ?? card?.cardId ?? card?.card_id)
  const tcgplayerProductId = normalizeNumericId(
    card?.tcgPlayerId ?? card?.tcgplayerProductId ?? card?.tcgplayer_product_id
  )
  const ptSetId = normalizeSetValue(card?.setId ?? card?.ptSetId ?? setOverride?.ptSetId)
  const setName = normalizeSetValue(card?.setName ?? setOverride?.name)
  const name = normalizeSetValue(card?.name ?? card?.cardName)
  const cardNumber = normalizeSetValue(card?.cardNumber ?? card?.number)
  const totalSetNumber = normalizeSetValue(card?.totalSetNumber ?? card?.totalSet)
  const rarity = normalizeSetValue(card?.rarity)
  const cardType = normalizeSetValue(card?.cardType ?? card?.type)
  const hp = normalizeSetValue(card?.hp)
  const stage = normalizeSetValue(card?.stage)
  const artist = normalizeSetValue(card?.artist)
  const tcgplayerUrl = normalizeSetValue(card?.tcgPlayerUrl ?? card?.tcgplayerUrl)
  const imageCdnUrl = normalizeSetValue(card?.imageCdnUrl ?? card?.image_cdn_url)
  const imageCdnUrl200 = normalizeSetValue(card?.imageCdnUrl200 ?? card?.image_cdn_url200)
  const imageCdnUrl400 = normalizeSetValue(card?.imageCdnUrl400 ?? card?.image_cdn_url400)
  const imageCdnUrl800 = normalizeSetValue(card?.imageCdnUrl800 ?? card?.image_cdn_url800)
  const priceMarket = normalizeSetValue(card?.prices?.market ?? card?.priceMarket)
  const priceListings = normalizeSetValue(card?.prices?.listings ?? card?.priceListings)
  const pricePrimaryCondition = normalizeSetValue(
    card?.prices?.primaryCondition ?? card?.pricePrimaryCondition
  )
  const pricePrimaryPrinting = normalizeSetValue(
    card?.prices?.primaryPrinting ?? card?.pricePrimaryPrinting
  )
  const priceLastUpdated = normalizeSetValue(card?.prices?.lastUpdated ?? card?.priceLastUpdated)
  const updatedAt = normalizeSetValue(card?.updatedAt ?? card?.updated_at)

  return {
    ptCardId,
    tcgplayerProductId,
    ptSetId,
    setName,
    name,
    cardNumber,
    totalSetNumber,
    rarity,
    cardType,
    hp,
    stage,
    artist,
    tcgplayerUrl,
    imageCdnUrl,
    imageCdnUrl200,
    imageCdnUrl400,
    imageCdnUrl800,
    priceMarket,
    priceListings,
    pricePrimaryCondition,
    pricePrimaryPrinting,
    priceLastUpdated,
    updatedAt
  }
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

  if (values.length !== 16) {
    throw new Error(`pt_sets upsert expected 16 values, got ${values.length}`)
  }

  const sql = `
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
  $11, $12, $13, $14, $15,
  $16
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
  updated_at = COALESCE(EXCLUDED.updated_at, now())
`.trim()

  await client.query(sql, values)
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

  const sql = `
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
`.trim()

  // --- Definitive runtime proof ---
  const cols = countInsertColumns(sql)
  const ph = countPlaceholders(sql)

  console.log('PT_UPSERT_CARD_FILE', __filename)
  console.log('PT_UPSERT_CARD_SQL_HASH', hashText(sql))
  console.log('PT_UPSERT_CARD_VALUES_LEN', values.length)
  console.log('PT_UPSERT_CARD_COLS', cols)
  console.log('PT_UPSERT_CARD_PH_TOTAL', ph.total)
  console.log('PT_UPSERT_CARD_PH_UNIQUE', ph.uniqueCount)
  // Uncomment if needed:
  // console.log('PT_UPSERT_CARD_PH_LIST', ph.unique)

  // Hard guard: if this fails, the SQL string is truly not what we expect
  if (cols !== 23 || ph.uniqueCount !== 23 || values.length !== 23) {
    console.error('PT_UPSERT_CARD_SQL_WITH_LINES\n' + withLineNumbers(sql))
    throw new Error(`pt_cards upsert guard failed: cols=${cols} phUnique=${ph.uniqueCount} bind=${values.length}`)
  }

  try {
    await client.query(sql, values)
  } catch (err) {
    console.error('PT_UPSERT_CARD_QUERY_ERROR', err.code, err.message)
    console.error('PT_UPSERT_CARD_SQL_WITH_LINES\n' + withLineNumbers(sql))
    // Also dump the first few values to ensure nothing weird like arrays sneaking in
    console.error('PT_UPSERT_CARD_SAMPLE_VALUES', values.slice(0, 5))
    throw err
  }
}

async function fetchPagedSets({ limit = 100 } = {}) {
  return fetchPaged('/sets', {}, { limit })
}

async function fetchCardsForSet(setSlug, { limit = 100 } = {}) {
  const params = {
    set: setSlug ?? null,
    fetchAllInSet: 'true'
  }

  return fetchPaged('/cards', params, { limit })
}

async function importPriceTracker({ limitSets = 100, limitCards = 100, dryRun = false } = {}) {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not set')
  }

  const pool = new Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()
  const summary = {
    setsFetched: 0,
    setsUpserted: 0,
    cardsFetched: 0,
    cardsUpserted: 0
  }

  try {
    if (!dryRun) {
      await client.query('BEGIN')
    }
    const sets = await fetchPagedSets({ limit: limitSets })
    summary.setsFetched = sets.length

    for (const rawSet of sets) {
      const mappedSet = mapPriceTrackerSet(rawSet)
      if (!mappedSet.ptSetId) {
        console.warn('PT_IMPORT_SKIP_SET_MISSING_ID', mappedSet)
        continue
      }

      if (!dryRun) {
        await upsertSet(client, mappedSet)
        summary.setsUpserted += 1
      }

      if (!mappedSet.ptSetSlug) {
        console.warn('PT_IMPORT_SKIP_SET_MISSING_SLUG', mappedSet)
        continue
      }

      const cards = await fetchCardsForSet(mappedSet.ptSetSlug, { limit: limitCards })
      summary.cardsFetched += cards.length

      for (const rawCard of cards) {
        const mappedCard = mapPriceTrackerCard(rawCard, mappedSet)
        if (!mappedCard.ptCardId) {
          console.warn('PT_IMPORT_SKIP_CARD_MISSING_ID', mappedCard)
          continue
        }

        if (!dryRun) {
          await upsertCard(client, mappedCard)
          summary.cardsUpserted += 1
        }
      }
    }
    if (!dryRun) {
      await client.query('COMMIT')
    }
  } catch (error) {
    if (!dryRun) {
      await client.query('ROLLBACK')
    }
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  return summary
}

module.exports = {
  importPriceTracker,
  mapPriceTrackerCard,
  mapPriceTrackerSet,
  upsertCard,
  upsertSet
}
