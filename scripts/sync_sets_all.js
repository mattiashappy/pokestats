const { Pool } = require('pg');
// Inbyggd fetch används (Node v20+)

// Hämta inställningar från dina befintliga Heroku-variabler
const API_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2';
const API_TOKEN = process.env.PT_API_TOKEN;
const KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer';

// Bygg auth-headern: "Bearer XXXXXX"
const AUTH_HEADER = `${KEY_PREFIX} ${API_TOKEN}`.trim();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function fetchSetsByLanguage(language) {
  let allSets = [];
  let offset = 0;
  let hasMore = true;

  console.log(`\n--- 📦 Fetching ${language.toUpperCase()} sets ---`);

  // Säkerhetskoll: Stoppa om ingen token finns
  if (!API_TOKEN) {
    console.error("❌ Error: PT_API_TOKEN saknas i miljövariablerna.");
    return [];
  }

  while (hasMore) {
    const url = `${API_BASE_URL}/sets?limit=100&offset=${offset}&language=${language}`;
    
    try {
      const response = await fetch(url, {
        headers: { 
          'Authorization': AUTH_HEADER,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`⚠️ Skipped ${language} (Status ${response.status}): Plan restriction or invalid key.`);
        // Om första sidan misslyckas, avbryt loopen för detta språk
        if (offset === 0) return [];
        break;
      }

      const json = await response.json();
      const sets = json.data || [];
      
      if (sets.length > 0) {
        allSets = allSets.concat(sets);
        console.log(`   Fetched ${sets.length} sets...`);
      }

      hasMore = json.metadata?.hasMore || false;
      offset += 100;
      
      // Säkerhetsspärr mot oändliga loopar
      if (offset > 5000) hasMore = false;

    } catch (error) {
      console.error(`❌ Error fetching ${language}:`, error.message);
      hasMore = false;
    }
  }
  
  return allSets;
}

async function upsertSets(client, sets, language) {
  if (sets.length === 0) return;
  
  console.log(`   💾 Saving ${sets.length} ${language} sets to database...`);
  
  for (const set of sets) {
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
    await upsertSets(client, englishSets, 'english');
    
    // 2. Hämta Japanska
    const japaneseSets = await fetchSetsByLanguage('japanese');
    await upsertSets(client, japaneseSets, 'japanese');

    console.log(`\n✅ Sync Complete.`);
    console.log(`Total English Sets Found: ${englishSets.length}`);
    console.log(`Total Japanese Sets Found: ${japaneseSets.length}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => console.error(e));
