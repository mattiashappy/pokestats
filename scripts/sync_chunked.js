const { Pool } = require('pg')

// 1. CONFIG
const PRICE_TRACKER_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2'
const PRICE_TRACKER_TOKEN = process.env.PT_API_TOKEN || process.env.PT_API_KEY
const DATABASE_URL = process.env.DATABASE_URL
const SLEEP_BETWEEN_SETS = 10000; // 10 sekunder (Safe mode!)

const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (key && value) acc[key] = parseInt(value, 10);
    return acc;
}, {});

const BATCH_START = args.START || 0;
const BATCH_SIZE = args.SIZE || 50;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// 2. API FETCH
async function fetchPriceTracker(endpoint, params = {}) {
  const url = new URL(`${PRICE_TRACKER_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  })

  while (true) {
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${PRICE_TRACKER_TOKEN}` } })
        
        if (response.status === 429) {
            console.log('   🛑 429 Rate Limit. Sleeping 120s to cool down completely...');
            await sleep(120000); // Vänta 2 minuter om vi kraschar
            continue;
        }
        if (!response.ok) {
            if (response.status === 402) throw new Error('QUOTA_EXCEEDED');
            const body = await response.text();
            throw new Error(`HTTP ${response.status}: ${body}`);
        }
        return await response.json();
    } catch (err) {
        if (err.message === 'QUOTA_EXCEEDED') throw err;
        console.error(`   ❌ Network Error (${err.message}). Retrying in 10s...`);
        await sleep(10000);
    }
  }
}

// 3. MAIN LOGIC
async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()
  
  try {
    console.log(`🚀 Starting CHUNKED SYNC (Repair Mode)`)
    console.log(`🎯 Batch Goal: Index ${BATCH_START} to ${BATCH_START + BATCH_SIZE}`)
    
    // 1. Hämta sets
    const allSets = [];
    console.log(`📦 Fetching set list...`);
    for (const lang of ['english', 'japanese']) {
        let offset = 0;
        let hasMore = true;
        while(hasMore) {
            const res = await fetchPriceTracker('/sets', { limit: 100, offset, language: lang });
            const data = res.data || [];
            data.forEach(s => { s._language = lang; s._numericId = s.tcgPlayerNumericId; });
            if(data.length) allSets.push(...data);
            hasMore = res.metadata?.hasMore || false;
            offset += 100;
            await sleep(500); 
        }
    }
    
    allSets.sort((a,b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    console.log(`✅ Total Sets Available: ${allSets.length}`);

    const targetSets = allSets.slice(BATCH_START, BATCH_START + BATCH_SIZE);
    
    if (targetSets.length === 0) {
        console.log("🏁 No sets found in this range.");
        return;
    }

    console.log(`📋 Processing ${targetSets.length} sets...`);

    let processed = 0;
    
    for (const set of targetSets) {
        processed++;
        const currentGlobalIndex = BATCH_START + processed;
        
        // --- SMART CHECK ---
        const setRes = await client.query('SELECT updated_at FROM pt_sets WHERE pt_set_id = $1', [set.id]);
        const dbRes = await client.query('SELECT COUNT(*) as c FROM pt_cards WHERE pt_set_id = $1', [set.id]);
        const dbCount = parseInt(dbRes.rows[0].c);
        
        const lastSetUpdate = setRes.rows[0]?.updated_at ? new Date(setRes.rows[0].updated_at) : new Date(0);
        const hoursSinceUpdate = (new Date() - lastSetUpdate) / (1000 * 60 * 60);

        // SPARA SET INFO
        await client.query(`
            INSERT INTO public.pt_sets (pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, image_cdn_url, language, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (pt_set_id) DO UPDATE SET updated_at = NOW()
        `, [set.id, set.tcgPlayerId, set.name, set.series, set.releaseDate, set.cardCount, set.imageCdnUrl, set._language, set.createdAt]);

        // LOGIK FÖR REPAIR RUN:
        // 1. Om vi har kort (>0) -> SKIP (Vi har redan datan, onödigt att hämta igen)
        // 2. Om vi har 0 kort -> KÖR (Oavsett när vi kollade sist, tvinga fram ett nytt försök för japanska kort)
        if (dbCount > 0) {
            console.log(`[${currentGlobalIndex}] ⏩ Skipping ${set.name} (Has ${dbCount} cards)`);
            continue;
        }
        
        // ÄNDRAD FRÅN 48 TILL 0 FÖR ATT TVINGA OMKÖRNING AV TOMMA SET
        if (hoursSinceUpdate < 0) { 
             console.log(`[${currentGlobalIndex}] ⏩ Skipping ${set.name} (Checked recently)`);
             continue;
        }
        
        if (!set._numericId) {
            console.log(`[${currentGlobalIndex}] ⚠️ Skipping ${set.name} (No Numeric ID)`);
            continue;
        }

        process.stdout.write(`[${currentGlobalIndex}] 📥 Syncing ${set.name} (${set._language})... `);

        let cards = [];
        let offset = 0;
        let hasMoreCards = true;
        
        try {
            while(hasMoreCards) {
                await sleep(SLEEP_BETWEEN_SETS); // 10 sekunders paus
                
                // HÄR ÄR FIXEN: Vi skickar med language!
                const res = await fetchPriceTracker('/cards', { 
                    setId: set._numericId, 
                    limit: 200, 
                    offset, 
                    language: set._language // <--- VIKTIGT!
                });
                
                const pageCards = res.data || [];
                if(pageCards.length) cards.push(...pageCards);
                hasMoreCards = res.metadata?.hasMore || false;
                offset += 200;
                if(offset > 5000) hasMoreCards = false;
            }
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
        }

        if (cards.length > 0) {
            for (const card of cards) {
                const pricesData = JSON.stringify(card.prices || {});
                const energy = card.energyType || [];
                await client.query(`
                    INSERT INTO public.pt_cards (
                        pt_card_id, tcgplayer_product_id, pt_set_id, set_name, name, card_number, total_set_number, rarity, card_type, hp, stage, artist, tcgplayer_url, image_cdn_url, price_market, pokemon_type, energy_type, flavor_text, prices_data, language, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
                    ON CONFLICT (pt_card_id) DO UPDATE SET 
                        price_market = EXCLUDED.price_market, 
                        prices_data = EXCLUDED.prices_data,
                        updated_at = NOW()
                `, [card.id, card.tcgPlayerId ? Number(card.tcgPlayerId) : null, set.id, set.name, card.name, card.cardNumber, card.totalSetNumber, card.rarity, card.cardType, card.hp, card.stage, card.artist, card.tcgPlayerUrl, card.imageCdnUrl, card.prices?.market, card.pokemonType, energy, card.flavorText, pricesData, set._language]);
            }
            console.log(`✅ Saved ${cards.length} cards.`);
        } else {
            console.log(`⚠️ 0 cards.`);
        }
    }
    console.log(`🎉 Batch Complete!`);
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') { console.error("⛔ CRITICAL: API Quota Exceeded."); } 
    else { console.error('FATAL ERROR:', err); }
  } finally {
    client.release();
    pool.end();
  }
}
run();
