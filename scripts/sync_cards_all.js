const { Pool } = require('pg');
// Native fetch in Node v20

const API_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2';
const API_TOKEN = process.env.PT_API_TOKEN;
const KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer';
const AUTH_HEADER = `${KEY_PREFIX} ${API_TOKEN}`.trim();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function fetchCardsForSet(setId, language) {
  // We use fetchAllInSet=true to get everything in one go (up to 200 limit usually handled by API pagination internally or we check hasMore)
  // However, specifically for this API, fetchAllInSet increases limit but we should still handle pagination if a set is huge.
  
  let allCards = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // We use the MongoDB ID (pt_set_id) as the setId filter
    const url = `${API_BASE_URL}/cards?setId=${setId}&language=${language}&fetchAllInSet=true&limit=200&offset=${offset}`;
    
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': AUTH_HEADER }
      });

      if (!res.ok) {
        console.warn(`   ⚠️ Failed to fetch cards for set ${setId} (${res.status}): ${res.statusText}`);
        return allCards; // Return what we have
      }

      const json = await res.json();
      const cards = json.data || [];
      
      if (cards.length > 0) {
        allCards = allCards.concat(cards);
      }

      hasMore = json.metadata?.hasMore || false;
      offset += 200; // API 'fetchAllInSet' usually allows higher limits, but safe to paginate

    } catch (err) {
      console.error(`   ❌ Error fetching cards: ${err.message}`);
      hasMore = false;
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
        card.id, // pt_card_id
        card.tcgPlayerId ? parseInt(card.tcgPlayerId) : null,
        card.setId || null, // Matches the pt_set_id we stored earlier
        card.setName,
        card.name,
        card.cardNumber,
        card.totalSetNumber,
        card.rarity,
        card.cardType,
        card.artist,
        card.tcgPlayerUrl,
        card.imageCdnUrl, // 800x800 image
        card.prices?.market || null,
        language
      ]
    );
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔄 Fetching all sets from database...");
    
    // We prioritize Japanese sets first since those were missing
    const res = await client.query(`
      SELECT pt_set_id, name, language, card_count 
      FROM public.pt_sets 
      ORDER BY language DESC, release_date DESC
    `);
    
    const totalSets = res.rows.length;
    console.log(`📋 Found ${totalSets} sets to process.`);

    let processed = 0;

    for (const set of res.rows) {
      processed++;
      const progress = ((processed / totalSets) * 100).toFixed(1);
      
      process.stdout.write(`[${progress}%] Syncing ${set.language.toUpperCase()} set: ${set.name}... `);
      
      const cards = await fetchCardsForSet(set.pt_set_id, set.language);
      
      if (cards.length > 0) {
        await upsertCards(client, cards, set.language);
        console.log(`✅ Saved ${cards.length} cards.`);
      } else {
        console.log(`⚠️ No cards found (expected ~${set.card_count}).`);
      }
    }

    console.log("\n🎉 All cards synced successfully!");

  } catch (err) {
    console.error("\n❌ Fatal Error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
