const { Pool } = require('pg');
// Native fetch in Node v20

const API_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2';
const API_TOKEN = process.env.PT_API_TOKEN;
const KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer';
const AUTH_HEADER = `${KEY_PREFIX} ${API_TOKEN}`.trim();

// 🛑 SETTING: Wait 1.5 seconds between API calls to stay under 60/minute limit
const DELAY_MS = 1500; 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

// Helper function to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchCardsForSet(setId, language) {
  let allCards = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // ⏱️ SLEEP before every request
    await sleep(DELAY_MS);

    const url = `${API_BASE_URL}/cards?setId=${setId}&language=${language}&fetchAllInSet=true&limit=200&offset=${offset}`;
    
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': AUTH_HEADER }
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          throw new Error(`Rate Limit Exceeded (${res.status})`);
        }
        console.warn(`   ⚠️ Failed to fetch cards for set ${setId} (${res.status}): ${res.statusText}`);
        return allCards;
      }

      const json = await res.json();
      const cards = json.data || [];
      
      if (cards.length > 0) {
        allCards = allCards.concat(cards);
      }

      hasMore = json.metadata?.hasMore || false;
      offset += 200;

    } catch (err) {
      throw err;
    }
  }
  return allCards;
}

async function upsertCards(client, cards, language) {
  if (cards.length === 0) return;

  for (const card of cards) {
    await client.query(
      `
      INSERT INTO public.pt_cards 
        (pt_card_id, tcgplayer_product_id, pt_set_id, set_name, name, card_number, 
         total_set_number, rarity, card_type, artist, tcgplayer_url, 
         image_cdn_url, price_market, price_last_updated, language, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, NOW())
      ON CONFLICT (pt_card_id) DO UPDATE
      SET tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
          pt_set_id = EXCLUDED.pt_set_id,
          name = EXCLUDED.name,
          price_market = EXCLUDED.price_market,
          price_last_updated = NOW(),
          language = EXCLUDED.language,
          updated_at = NOW()
      `,
      [
        card.id, 
        card.tcgPlayerId ? parseInt(card.tcgPlayerId) : null,
        card.setId || null, 
        card.setName,
        card.name,
        card.cardNumber,
        card.totalSetNumber,
        card.rarity,
        card.cardType,
        card.artist,
        card.tcgPlayerUrl,
        card.imageCdnUrl, 
        card.prices?.market || null,
        language
      ]
    );
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔄 Finding sets that are MISSING cards...");
    
    // Find sets with 0 cards in the database
    const res = await client.query(`
      SELECT s.pt_set_id, s.name, s.language 
      FROM public.pt_sets s
      LEFT JOIN public.pt_cards c ON s.pt_set_id = c.pt_set_id
      WHERE c.pt_card_id IS NULL
      GROUP BY s.pt_set_id
      ORDER BY s.release_date DESC
    `);
    
    const setsToSync = res.rows;
    console.log(`📋 Found ${setsToSync.length} sets that need syncing.`);

    if (setsToSync.length === 0) {
      console.log("🎉 All sets appear to be populated!");
      return;
    }

    let processed = 0;

    for (const set of setsToSync) {
      processed++;
      const progress = ((processed / setsToSync.length) * 100).toFixed(1);
      
      process.stdout.write(`[${progress}%] Resuming ${set.language.toUpperCase()} set: ${set.name}... `);
      
      try {
        const cards = await fetchCardsForSet(set.pt_set_id, set.language);
        
        if (cards.length > 0) {
          await upsertCards(client, cards, set.language);
          console.log(`✅ Saved ${cards.length} cards.`);
        } else {
          console.log(`⚠️ API returned 0 cards.`);
        }
      } catch (err) {
        if (err.message.includes("Rate Limit")) {
          console.error(`\n⛔ ${err.message}. Waiting 60 seconds before retrying...`);
          await sleep(60000); // Wait 1 minute if we hit a hard block
        } else {
          console.error(`\n❌ Error: ${err.message}`);
        }
      }
    }

  } catch (err) {
    console.error("\n❌ Fatal Error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}
run()
