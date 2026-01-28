const crypto = require('crypto')
const { Pool } = require('pg')

// 1. CONFIG & ENV
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

// Helper for waiting
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 2. HELPER FUNCTIONS
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

function normalizeSetValue(value) {
  if (value === undefined) return null
  if (value === '') return null
  return value ?? null
}

// 3. API FETCHING
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
  // console.log('DEBUG: Fetching', url.toString()) 
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PRICE_TRACKER_TOKEN}`
    }
  })

  if (!response.ok) {
    const body = await response.text()
    // Om vi slår i taket, kasta ett specifikt fel
    if (response.status === 429 || response.status === 403) {
       throw new Error(`RATE_LIMIT: ${response.status}`)
    }
    throw new Error(`Request failed (${response.status}): ${body}`)
  }

  return response.json()
}

function normalizePriceTrackerData(payload) {
  const data = payload?.data ?? null
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

// Hämtar set
async function fetchPagedSets({ limit = 100 } = {}) {
  const items = []
  let offset = 0
  let hasMore = true
  
  while(hasMore) {
    const payload = await fetchPriceTracker('/sets', { limit, offset })
    const pageItems = normalizePriceTrackerData(payload)
    if (pageItems.length) items.push(...pageItems)
    
    hasMore = payload.metadata?.hasMore || false
    offset += limit
    if (!hasMore) break
  }
  return items
}

// Hämtar kort (Använder SLUG istället för ID - vilket löser ditt problem!)
async function fetchCardsForSet(setSlug, { limit = 200, sleepMs = 500 } = {}) {
  const items = []
  let offset = 0
  let hasMore = true
  
  // Vi sover lite innan varje set för att vara snälla mot APIet
  if (sleepMs > 0) await sleep(sleepMs)

  while (hasMore) {
    // VIKTIGT: Här använder vi setSlug (t.ex. 'sv06-twilight-masquerade')
    const payload = await fetchPriceTracker('/cards', { 
        set: setSlug, 
        fetchAllInSet: 'true',
        limit, 
        offset 
    })
    
    const pageItems = normalizePriceTrackerData(payload)
    if (pageItems.length) items.push(...pageItems)

    hasMore = payload.metadata?.hasMore || false
    offset += limit
    
    // Säkerhetsspärr mot oändliga loopar
    if (offset > 5000) hasMore = false 
  }

  return items
}

// 4. MAPPING FUNCTIONS (UPPDATERAD MED NYA FÄLT)
function mapPriceTrackerSet(set) {
  return {
    ptSetId: normalizeSetValue(set?.id),
    tcgplayerSetId: normalizeString(set?.tcgPlayerId), // Detta är "slug"
    ptSetSlug: normalizeString(set?.tcgPlayerId),      // Samma sak
    name: normalizeSetValue(set?.name),
    series: normalizeSetValue(set?.series),
    releaseDate: normalizeSetValue(set?.releaseDate),
    cardCount: normalizeSetValue(set?.cardCount),
    imageCdnUrl: normalizeSetValue(set?.imageCdnUrl),
    createdAt: normalizeSetValue(set?.createdAt),
    updatedAt: normalizeSetValue(set?.updatedAt)
  }
}

function mapPriceTrackerCard(card, setOverride = null) {
  return {
    ptCardId: normalizeSetValue(card?.id),
    tcgplayerProductId: normalizeNumericId(card?.tcgPlayerId),
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
    
    // --- NYA FÄLT SOM LADES TILL ---
    pokemonType: normalizeSetValue(card?.pokemonType),
    energyType: card?.energyType || [], // Array
    flavorText: normalizeSetValue(card?.flavorText),
    pricesData: JSON.stringify(card?.prices || {}), // Hela prisobjektet
    
    updatedAt: new Date()
  }
}

// 5. DATABASE UPSERTS
async function upsertSet(client, set) {
  const sql = `
    INSERT INTO public.pt_sets (
      pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, 
      image_cdn_url, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (pt_set_id) DO UPDATE SET
      tcgplayer_set_id = EXCLUDED.tcgplayer_set_id,
      name = EXCLUDED.name,
      series = EXCLUDED.series,
      release_date = EXCLUDED.release_date,
      card_count = EXCLUDED.card_count,
      updated_at = NOW()
  `
  await client.query(sql, [
    set.ptSetId, set.tcgplayerSetId, set.name, set.series, 
    set.releaseDate, set.cardCount, set.imageCdnUrl, set.createdAt
  ])
}

async function upsertCard(client, card) {
  // Här har vi lagt till de nya kolumnerna i SQL:en
  const sql = `
    INSERT INTO public.pt_cards (
      pt_card_id, tcgplayer_product_id, pt_set_id, set_name, name, 
      card_number, total_set_number, rarity, card_type, 
      hp, stage, artist, tcgplayer_url, image_cdn_url, price_market,
      pokemon_type, energy_type, flavor_text, prices_data, 
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 
      $6, $7, $8, $9, 
      $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19,
      NOW()
    )
    ON CONFLICT (pt_card_id) DO UPDATE SET
      tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
      pt_set_id = EXCLUDED.pt_set_id,
      name = EXCLUDED.name,
      price_market = EXCLUDED.price_market,
      
      -- Uppdatera de nya fälten
      pokemon_type = EXCLUDED.pokemon_type,
      energy_type = EXCLUDED.energy_type,
      flavor_text = EXCLUDED.flavor_text,
      prices_data = EXCLUDED.prices_data,
      
      updated_at = NOW()
  `
  
  const values = [
    card.ptCardId, card.tcgplayerProductId, card.ptSetId, card.setName, card.name,
    card.cardNumber, card.totalSetNumber, card.rarity, card.cardType,
    card.hp, card.stage, card.artist, card.tcgplayerUrl, card.imageCdnUrl, card.priceMarket,
    card.pokemonType, card.energyType, card.flavorText, card.pricesData
  ]

  await client.query(sql, values)
}

// 6. MAIN LOGIC
async function run() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL missing')
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })
  
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting PRO sync (using Set Slugs + Full Data)...')

    // 1. Hämta alla set först
    console.log('📦 Fetching all sets...')
    const allSets = await fetchPagedSets({ limit: 100 })
    console.log(`   Found ${allSets.length} sets.`)

    // 2. Loopa igenom sets
    let processed = 0
    for (const rawSet of allSets) {
      processed++
      const set = mapPriceTrackerSet(rawSet)

      // Spara setet
      await upsertSet(client, set)

      // Om setet saknar slug kan vi inte hämta kort på detta sätt
      if (!set.ptSetSlug) {
        console.log(`⚠️ Skipping cards for ${set.name} (No slug/TCG ID)`)
        continue
      }

      // Hämta korten med hjälp av SLUG (Detta löser "0 cards" felet)
      process.stdout.write(`[${processed}/${allSets.length}] Syncing ${set.name} (${set.ptSetSlug})... `)
      
      try {
        const rawCards = await fetchCardsForSet(set.ptSetSlug, { limit: 200 })
        
        if (rawCards.length > 0) {
          // Spara korten
          for (const rawCard of rawCards) {
            const card = mapPriceTrackerCard(rawCard, set)
            await upsertCard(client, card)
          }
          console.log(`✅ Saved ${rawCards.length} cards.`)
        } else {
            // Om det är tomt kanske det är ett framtida set, eller så saknar APIet data
            console.log(`⚠️ 0 cards found.`)
        }

      } catch (err) {
        console.error(`❌ Error fetching set: ${err.message}`)
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
