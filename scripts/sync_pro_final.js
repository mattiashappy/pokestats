const { Pool } = require('pg')

// 1. CONFIG
const PRICE_TRACKER_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const DATABASE_URL = process.env.DATABASE_URL
const SLEEP_BETWEEN_SETS = 4000; // 4 seconds (Balance between speed and safety)

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// 2. BULLETPROOF FETCH (Handles 429 Retries Automatically)
async function fetchPriceTracker(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  })

  // Retry loop: Will keep trying if it hits a rate limit
  while (true) {
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${PRICE_TRACKER_TOKEN}` } })
        
        if (response.status === 429) {
            console.log('   ⏳ 429 Rate Limit Hit. Sleeping 60s before retrying...');
            await sleep(65000); // Wait 65 seconds to be safe
            continue; // RETRY the same request
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`HTTP ${response.status}: ${body}`);
        }

        return await response.json(); // Success!

    } catch (err) {
        // If it's a network error, wait a bit and retry too
        console.error(`   ❌ Network Error: ${err.message}. Retrying in 5s...`);
        await sleep(5000);
    }
  }
}

// 3. MAIN LOGIC
async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()
  
  try {
    console.log('🚀 Starting FINAL SYNC (Bulletproof Mode)...')
    
    // --- STEP 1: FETCH ALL SETS ---
    const allSets = [];
    for (const lang of ['english', 'japanese']) {
        let offset = 0;
        let hasMore = true;
        console.log(`📦 Fetching ${lang.toUpperCase()} sets list...`);
        while(hasMore) {
            const res = await fetchPriceTracker('/sets', { limit: 100, offset, language: lang });
            const data = res.data || [];
            
            data.forEach(s => {
                s._language = lang;
                s._numericId = s.tcgPlayerNumericId; 
            });
            
            if(data.length) allSets.push(...data);
            hasMore = res.metadata?.hasMore || false;
            offset += 100;
            await sleep(500); 
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
        const searchId = set._numericId; 

        // Save Set to DB 
        await client.query(`
            INSERT INTO public.pt_sets (pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, image_cdn_url, language, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (pt_set_id) DO UPDATE SET 
                tcgplayer_set_id = EXCLUDED.tcgplayer_set_id,
                card_count = EXCLUDED.card_count,
                updated_at = NOW()
        `, [set.id, set.tcgPlayerId, set.name, set.series, set.releaseDate, set.cardCount, set.imageCdnUrl, lang, set.createdAt]);

        if (!searchId) {
            console.log(`[${processed}/${allSets.length}] ⏩ Skipping ${set.name} (No Numeric ID available)`);
            continue;
        }

        process.stdout.write(`[${processed}/${allSets.length}] ${lang.slice(0,3).toUpperCase()} ${set.name} (ID:${searchId})... `);

        // Fetch Cards
        let cards = [];
        let offset = 0;
        let hasMoreCards = true;
        
        while(hasMoreCards) {
            await sleep(SLEEP_BETWEEN_SETS);
            
            // This call is now safe - it will internally pause and retry if needed
            const res = await fetchPriceTracker('/cards', { 
                setId: searchId, 
                limit: 200, 
                offset 
            });
            
            const pageCards = res.data || [];
            if(pageCards.length) cards.push(...pageCards);
            
            hasMoreCards = res.metadata?.hasMore || false;
            offset += 200;
            
            // Safety break
            if(offset > 5000) hasMoreCards = false;
        }

        if (cards.length > 0) {
            for (const card of cards) {
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
