const { Pool } = require('pg')

// 1. CONFIG & ENV
const PRICE_TRACKER_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const DATABASE_URL = process.env.DATABASE_URL

// Helper for waiting
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeString(value) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function normalizeSetValue(value) {
  if (value === undefined) return null
  if (value === '') return null
  return value ?? null
}

// 3. API FETCHING
async function fetchPriceTracker(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  })

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${PRICE_TRACKER_TOKEN}` }
  })

  if (!response.ok) {
    if (response.status === 429 || response.status === 403) throw new Error(`RATE_LIMIT: ${response.status}`)
    const body = await response.text()
    throw new Error(`Request failed (${response.status}): ${body}`)
  }
  return response.json()
}

// Hämtar sets (Engelska + Japanska)
async function fetchPagedSets({ limit = 100 } = {}) {
  const items = []
  
  // Vi hämtar BÅDE engelska och japanska explicit för att vara säkra
  const languages = ['english', 'japanese']
  
  for (const lang of languages) {
    let offset = 0
    let hasMore = true
    console.log(`📦 Fetching ${lang.toUpperCase()} sets...`)
    
    while(hasMore) {
      const payload = await fetchPriceTracker('/sets', { limit, offset, language: lang })
      const data = payload?.data || []
      
      // Tagga setet med språk så vi vet
      data.forEach(s => s._language = lang)
      
      if (data.length) items.push(...data)
      
      hasMore = payload.metadata?.hasMore || false
      offset += limit
      if (!hasMore) break
    }
  }
  return items
}

// Hämtar kort med QUERY param (Säkrare för Pro API)
async function fetchCardsForSet(setId, { limit = 200, sleepMs = 250 } = {}) {
  const items = []
  let offset = 0
  let hasMore = true
  
  if (sleepMs > 0) await sleep(sleepMs)

  while (hasMore) {
    // VIKTIGT: Vi använder 'q' parameter med set.id
    const payload = await fetchPriceTracker('/cards', { 
        q: `set.id:${setId}`, 
        limit, 
        offset 
    })
    
    const data = payload?.data || []
    if (data.length) items.push(...data)

    hasMore = payload.metadata?.hasMore || false
    offset += limit
    
    // Säkerhetsspärr
    if (offset > 5000) hasMore = false 
  }
  return items
}

// 4. MAPPING
function mapPriceTrackerSet(set) {
  return {
    ptSetId: normalizeSetValue(set?.id),
    tcgplayerSetId: normalizeString(set?.tcgPlayerId), 
    name: normalizeSetValue(set?.name),
    series: normalizeSetValue(set?.series),
    releaseDate: normalizeSetValue(set?.releaseDate),
    cardCount: normalizeSetValue(set?.cardCount),
    imageCdnUrl: normalizeSetValue(set?.imageCdnUrl),
    language: set._language || 'english', // Spara språket!
    createdAt: normalizeSetValue(set?.createdAt)
  }
}

function mapPriceTrackerCard(card, setOverride) {
  return {
    ptCardId: normalizeSetValue(card?.id),
    tcgplayerProductId: card?.tcgPlayerId ? Number(card.tcgPlayerId) : null,
    ptSetId: normalizeSetValue(setOverride?.ptSetId || card?.setId),
    setName: normalizeSetValue(setOverride?.name || card?.setName),
    name: normalizeSetValue(card?.name),
    cardNumber: normalizeSetValue(card?.cardNumber),
    totalSetNumber: normalizeSetValue(card?.totalSetNumber),
    rarity: normalizeSetValue(card?.rarity),
    cardType: normalizeSetValue(card?.cardType),
    hp: normalizeSetValue(card?.hp),
    stage: normalizeSetValue(card?.stage),
    artist: normalizeSetValue(card?.artist),
    tcgplayerUrl: normalizeSetValue(card?.tcgPlayerUrl),
    imageCdnUrl: normalizeSetValue(card?.imageCdnUrl),
    priceMarket: normalizeSetValue(card?.prices?.market),
    pokemonType: normalizeSetValue(card?.pokemonType),
    energyType: card?.energyType || [], 
    flavorText: normalizeSetValue(card?.flavorText),
    pricesData: JSON.stringify(card?.prices || {}), 
    language: setOverride?.language || 'english' // Arv språket från setet
  }
}

// 5. DB
async function upsertSet(client, set) {
  // OBS: Vi litar på att tabellen är tömd/ren, men kör ON CONFLICT för säkerhets skull
  const sql = `
    INSERT INTO public.pt_sets (
      pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, 
      image_cdn_url, language, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (pt_set_id) DO UPDATE SET
      tcgplayer_set_id = EXCLUDED.tcgplayer_set_id,
      name = EXCLUDED.name,
      card_count = EXCLUDED.card_count,
      language = EXCLUDED.language,
      updated_at = NOW()
  `
  await client.query(sql, [
    set.ptSetId, set.tcgplayerSetId, set.name, set.series, 
    set.releaseDate, set.cardCount, set.imageCdnUrl, set.language, set.createdAt
  ])
}

async function upsertCard(client, card) {
  const sql = `
    INSERT INTO public.pt_cards (
      pt_card_id, tcgplayer_product_id, pt_set_id, set_name, name, 
      card_number, total_set_number, rarity, card_type, 
      hp, stage, artist, tcgplayer_url, image_cdn_url, price_market,
      pokemon_type, energy_type, flavor_text, prices_data, language,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 
      $6, $7, $8, $9, 
      $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20,
      NOW()
    )
    ON CONFLICT (pt_card_id) DO UPDATE SET
      price_market = EXCLUDED.price_market,
      prices_data = EXCLUDED.prices_data,
      updated_at = NOW()
  `
  await client.query(sql, [
    card.ptCardId, card.tcgplayerProductId, card.ptSetId, card.setName, card.name,
    card.cardNumber, card.totalSetNumber, card.rarity, card.cardType,
    card.hp, card.stage, card.artist, card.tcgplayerUrl, card.imageCdnUrl, card.priceMarket,
    card.pokemonType, card.energyType, card.flavorText, card.pricesData, card.language
  ])
}

// 6. MAIN
async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting PRO sync (Clean DB mode)...')

    // 1. Fetch ALL Sets
    const allSets = await fetchPagedSets({ limit: 100 })
    console.log(`✅ Found total ${allSets.length} sets (English + Japanese).`)

    let processed = 0
    
    // Sortera så vi tar nyaste först (valfritt, men kul att se)
    allSets.sort((a,b) => new Date(b.releaseDate) - new Date(a.releaseDate))

    for (const rawSet of allSets) {
      processed++
      const set = mapPriceTrackerSet(rawSet)

      await upsertSet(client, set)

      // Använd ptSetId (Mongo ID) för queryn
      process.stdout.write(`[${processed}/${allSets.length}] ${set.language.toUpperCase().slice(0,3)}: ${set.name}... `)
      
      try {
        // HÄR ÄR NYCKELN: Vi söker på ID
        const rawCards = await fetchCardsForSet(set.ptSetId, { limit: 200 })
        
        if (rawCards.length > 0) {
          for (const rawCard of rawCards) {
            const card = mapPriceTrackerCard(rawCard, set)
            await upsertCard(client, card)
          }
          console.log(`✅ Saved ${rawCards.length} cards.`)
        } else {
            console.log(`⚠️ 0 cards (Future set/Empty).`)
        }
      } catch (err) {
        console.error(`❌ Error: ${err.message}`)
      }
    }

    console.log('🎉 Sync Complete!')

  } catch (err) {
    console.error('FATAL ERROR:', err)
  } finally {
    client.release()
    await pool.end()
  }
}
run()
