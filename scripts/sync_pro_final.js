const { Pool } = require('pg')

// 1. CONFIG
const PRICE_TRACKER_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const DATABASE_URL = process.env.DATABASE_URL
const SLEEP_BETWEEN_SETS = 2000; // 2 seconds between sets to be safe

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// 2. API FETCH WRAPPER
async function fetchPriceTracker(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  })
  
  // Console log for debugging (hidden token)
  // console.log(`Fetching: ${url.pathname}${url.search}`);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${PRICE_TRACKER_TOKEN}` } })
  
  if (!response.ok) {
    if (response.status === 429) throw new Error('RATE_LIMIT')
    const body = await response.text()
    throw new Error(`HTTP ${response.status}: ${body}`)
  }
  return response.json()
}

// 3. MAIN LOGIC
async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting FINAL SYNC (Numeric ID Strategy)...')
    
    // --- STEP 1: FETCH ALL SETS ---
    const allSets = [];
    // We fetch both languages to get the complete DB
    for (const lang of ['english', 'japanese']) {
        let offset = 0;
        let hasMore = true;
        console.log(`📦 Fetching ${lang.toUpperCase()} sets list...`);
        while(hasMore) {
            try {
                const res = await fetchPriceTracker('/sets', { limit: 100, offset, language: lang });
                const data = res.data || [];
                
                data.forEach(s => {
                    s._language = lang; // Tag the language
                });
                
                if(data.length) allSets.push(...data);
                hasMore = res.metadata?.hasMore || false;
                offset += 100;
                await sleep(500); // Brief pause between set pages
            } catch (e) {
                console.error(`Error fetching sets page: ${e.message}`);
                hasMore = false; 
            }
        }
    }
    console.log(`✅ Total Sets Found: ${allSets.length}`);
    
    // Sort: Newest First
    allSets.sort((a,b) => new Date(b.releaseDate) - new Date(a.releaseDate));

    // --- STEP 2: LOOP SETS AND FETCH CARDS ---
    let processed = 0;
    
    for (const set of allSets) {
        processed++;
        const lang = set._language;
        
        // THE SECRET KEY: We must use the Numeric ID
        const searchId = set.tcgPlayerNumericId; 

        // Save Set to DB 
        // We use set.id (MongoID) as our Primary Key, but store the others for reference
        await client.query(`
            INSERT INTO public.pt_sets (pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, image_cdn_url, language, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (pt_set_id) DO UPDATE SET 
                tcgplayer_set_id = EXCLUDED.tcgplayer_set_id,
                card_count = EXCLUDED.card_count,
                updated_at = NOW()
        `, [set.id, set.tcgPlayerId, set.name, set.series, set.releaseDate, set.cardCount, set.imageCdnUrl, lang, set.createdAt]);

        // If no numeric ID (e.g. some promo sets), we might skip or try the mongo ID as fallback
        if (!searchId) {
            console.log(`[${processed}/${allSets.length}] ⏩ Skipping ${set.name} (No Numeric ID available)`);
            continue;
        }

        process.stdout.write(`[${processed}/${allSets.length}] ${lang.slice(0,3).toUpperCase()} ${set.name} (ID:${searchId})... `);

        // Fetch Cards
        let cards = [];
        let offset = 0;
        let hasMoreCards = true;
        
        try {
            while(hasMoreCards) {
                await sleep(SLEEP_BETWEEN_SETS); // Respect rate limits
                
                // Fetch using the Numeric ID
                const res = await fetchPriceTracker('/cards', { 
                    setId: searchId, 
                    limit: 200, 
                    offset 
                });
                
                const pageCards = res.data || [];
                if(pageCards.length) cards.push(...pageCards);
                
                hasMoreCards = res.metadata?.hasMore || false;
                offset += 200;
                
                // Safety break for massive sets
                if(offset > 5000) hasMoreCards = false;
            }
        } catch (err) {
            if(err.message === 'RATE_LIMIT') {
                console.log('\n❌ RATE LIMIT HIT! Pausing for 60s...');
                await sleep(60000);
            } else {
                console.log(`\n❌ Error fetching cards: ${err.message}`);
            }
        }

        if (cards.length > 0) {
            // Batch insert could be faster, but loop is safer for data integrity
            for (const card of cards) {
                // Ensure text fields don't break SQL
                const flavor = card.flavorText || null;
                const types = card.pokemonType || null;
                const energy = card.energyType || [];
                const pricesData = JSON.stringify(card.prices || {});

                await client.query(`
                    INSERT INTO public.pt_cards (
                        pt_card_id, tcgplayer_product_id, pt_set_id, set_name, name, card_number, total_set_number, rarity, card_type, hp, stage, artist, tcgplayer_url, image_cdn_url, price_market, pokemon_type, energy_type, flavor_text, prices_data, language, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
                    ON CONFLICT (pt_card_id) DO UPDATE SET 
                        price_market = EXCLUDED.price_market, 
                        prices_data = EXCLUDED.prices_data,
                        updated_at = NOW()
                `, [
                    card.id, 
                    card.tcgPlayerId ? Number(card.tcgPlayerId) : null, 
                    set.id, 
                    set.name, 
                    card.name, 
                    card.cardNumber, 
                    card.totalSetNumber, 
                    card.rarity, 
                    card.cardType, 
                    card.hp, 
                    card.stage, 
                    card.artist, 
                    card.tcgPlayerUrl, 
                    card.imageCdnUrl, 
                    card.prices?.market, 
                    types, 
                    energy, 
                    flavor, 
                    pricesData, 
                    lang
                ]);
            }
            console.log(`✅ Saved ${cards.length} cards.`);
        } else {
            console.log(`⚠️ 0 cards found.`);
        }
    }

    console.log('🎉 Sync Complete!');

  } catch (err) {
    console.error('FATAL ERROR:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
