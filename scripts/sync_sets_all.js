const { Pool } = require('pg');
// OBS: Tog bort 'node-fetch' eftersom Node v20 har inbyggd fetch

const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2';
const API_KEY = process.env.POKEMON_PRICE_TRACKER_API_KEY;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function fetchSetsByLanguage(language) {
  let allSets = [];
  let offset = 0;
  let hasMore = true;

  console.log(`\n--- 📦 Fetching ${language.toUpperCase()} sets ---`);

  while (hasMore) {
    const url = `${API_BASE_URL}/sets?limit=100&offset=${offset}&language=${language}`;
    
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });

      if (!response.ok) {
        console.warn(`⚠️ Skipped ${language} (Status ${response.status}): Plan restriction or invalid key.`);
        return [];
      }

      const json = await response.json();
      const sets = json.data || [];
      
      if (sets.length > 0) {
        allSets = allSets.concat(sets);
        console.log(`   Fetched ${sets.length} sets...`);
      }

      hasMore = json.metadata?.hasMore || false;
      offset += 100;
    } catch (error) {
      console.error(`❌ Error fetching ${language}:`, error.message);
      hasMore = false;
    }
  }
  
  return allSets;
}

async function upsertSets(client, sets, language) {
  for (const set of sets) {
    // VIKTIGT: Vi använder set.id (från API) som pt_set_id i databasen för att matcha din schema
    await client.query(
      `
      INSERT INTO public.pt_sets 
        (pt_set_id, tcgplayer_set_id, name, series, release_date, card_count, language, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (pt_set_id) DO UPDATE
      SET name = EXCLUDED.name,
          series = EXCLUDED.series,
          card_count = EXCLUDED.card_count,
          language = EXCLUDED.language,
          updated_at = NOW()
      `,
      [
        set.id, 
        set.tcgPlayerId, 
        set.name, 
        set.series, 
        set.releaseDate, 
        set.cardCount, 
        language
      ]
    );
  }
}

async function run() {
  const client = await pool.connect();
  try {
    // 1. Hämta Engelska
    const englishSets = await fetchSetsByLanguage('english');
    if (englishSets.length > 0) {
        await upsertSets(client, englishSets, 'english');
    }
    
    // 2. Hämta Japanska (Kräver betald nyckel)
    const japaneseSets = await fetchSetsByLanguage('japanese');
    if (japaneseSets.length > 0) {
        await upsertSets(client, japaneseSets, 'japanese');
    }

    console.log(`\n✅ Sync Complete.`);
    console.log(`Total English Sets Found: ${englishSets.length}`);
    console.log(`Total Japanese Sets Found: ${japaneseSets.length}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => console.error(e));
