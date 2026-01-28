const { Pool } = require('pg')

// 1. CONFIG
const PRICE_TRACKER_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const DATABASE_URL = process.env.DATABASE_URL
const SLEEP_BETWEEN_CALLS = 1500; // 1.5 sekunder (Säkert för Rate Limit)

// Helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeSetValue(value) {
  if (value === undefined || value === '') return null
  return value ?? null
}

function normalizeString(value) {
  return value ? String(value).trim() : null
}

// 2. API FETCH
async function fetchPriceTracker(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  })

  // Logga URL för debug (utan token)
  // console.log(`DEBUG: Fetching ${url.pathname}${url.search}`)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${PRICE_TRACKER_TOKEN}` }
  })

  if (!response.ok) {
    if (response.status === 429) throw new Error(`RATE_LIMIT_429`)
    const body = await response.text()
    throw new Error(`Request failed (${response.status}): ${body}`)
  }
  return response.json()
}

// 3. LOGIC
async function fetchPagedSets() {
  const items = []
  const languages = ['english', 'japanese']
  
  for (const lang of languages) {
    let offset = 0
    let hasMore = true
    console.log(`📦 Fetching ${lang.toUpperCase()} sets...`)
    
    while(hasMore) {
      await sleep(SLEEP_BETWEEN_CALLS) // Sov lite även här
      const payload = await fetchPriceTracker('/sets', { limit: 100, offset, language: lang })
      const data = payload?.data || []
      data.forEach(s => s._language = lang)
      
      if (data.length) items.push(...data)
      
      hasMore = payload.metadata?.hasMore || false
      offset += 100
    }
  }
  return items
}

async function fetchCardsForSet(setIdOrSlug, { limit = 200 } = {}) {
  const items = []
  let offset = 0
  let hasMore = true
  
  while (hasMore) {
    await sleep(SLEEP_BETWEEN_CALLS) // VIKTIGT: Sov innan varje sid-anrop

    // FIX: Använd 'setId' parametern, men skicka in sluggen (tcgPlayerId)
    // Detta matchar vad som fungerade i din debug_api_v2.js (Test 2)
    const payload = await fetchPriceTracker('/cards', { 
        setId: setIdOrSlug, 
        limit, 
        offset 
    })
    
    const data = payload?.data || []
    if (data.length) items.push(...data)

    hasMore = payload.metadata?.hasMore || false
    offset += limit
    
    if (offset > 5000) hasMore = false 
  }
  return items
}

// 4. MAPPERS & DB (Samma som förut)
function mapSet(set) {
  return {
    ptSetId: normalizeSetValue(set?.id),
    tcgplayerSetId: normalizeString(set?.tcgPlayerId), 
    name: normalizeSetValue(set?.name),
    series: normalizeSetValue(set?.series),
    releaseDate: normalizeSetValue(set?.releaseDate),
    cardCount: normalizeSetValue(set?.cardCount),
    imageCdnUrl: normalizeSetValue(set?.imageCdnUrl),
    language: set._language || 'english',
    createdAt: normalizeSetValue(set?.createdAt)
  }
}

function mapCard(card, setOverride) {
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
    language: setOverride?.language || 'english'
  }
}

async function upsertSet(client, set) {
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

// 5. MAIN
async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting PRO sync (Slow & Steady Mode)...')
    
    // 1. Fetch Sets
    const allSets = await fetchPagedSets()
    console.log(`✅ Found total ${allSets.length} sets.`)

    // Sort: Newest First
    allSets.sort((a,b) => new Date(b.releaseDate) - new Date(a.releaseDate))

    let processed = 0
    for (const rawSet of allSets) {
      processed++
      const set = mapSet(rawSet)
      
      // Upsert Set
      await upsertSet(client, set)

      // LOGIK FÖR ID:
      // Om setet har en tcgplayer_set_id (slug), använd den. 
      // Annars fall tillbaka på ptSetId (Mongo ID).
      const idToUse = set.tcgplayerSetId || set.ptSetId
      
      process.stdout.write(`[${processed}/${allSets.length}] ${set.language.toUpperCase().slice(0,3)}: ${set.name}... `)
      
      try {
        const rawCards = await fetchCardsForSet(idToUse, { limit: 200 })
        
        if (rawCards.length > 0) {
          for (const rawCard of rawCards) {
            const card = mapCard(rawCard, set)
            await upsertCard(client, card)
          }
          console.log(`✅ Saved ${rawCards.length} cards.`)
        } else {
            console.log(`⚠️ 0 cards.`)
        }
      } catch (err) {
        if (err.message.includes('429')) {
             console.error(`❌ RATE LIMIT HIT! Waiting 60s...`)
             await sleep(60000) // Nödbroms: Vänta 1 minut
        } else {
             console.error(`❌ Error: ${err.message}`)
        }
      }
    }
    console.log('🎉 Sync Complete!')
  } catch (err) {
    console.error('FATAL:', err)
  } finally {
    client.release()
    await pool.end()
  }
}
run()
