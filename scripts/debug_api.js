const API_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2';
const API_TOKEN = process.env.PT_API_TOKEN;
const KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer';
const AUTH_HEADER = `${KEY_PREFIX} ${API_TOKEN}`.trim();

async function run() {
  // 1. We'll search for "Twilight Masquerade" to find its IDs
  console.log("🔍 Looking up 'Twilight Masquerade'...");
  const searchUrl = `${API_BASE_URL}/sets?search=Twilight%20Masquerade&limit=1`;
  
  const searchRes = await fetch(searchUrl, { headers: { 'Authorization': AUTH_HEADER } });
  const searchJson = await searchRes.json();
  
  if (!searchJson.data || searchJson.data.length === 0) {
    console.error("❌ Could not find set 'Twilight Masquerade' in API search.");
    return;
  }

  const set = searchJson.data[0];
  console.log(`✅ Found Set: ${set.name}`);
  console.log(`   Mongo ID (id): ${set.id}`);
  console.log(`   TCGPlayer ID (tcgPlayerId): ${set.tcgPlayerId}`);
  console.log(`   Expected Card Count: ${set.cardCount}`);

  // 2. Try fetching cards using the Mongo ID
  console.log(`\n📡 Attempt 1: Fetching cards using Mongo ID (${set.id})...`);
  const cardsUrl = `${API_BASE_URL}/cards?setId=${set.id}&language=english&limit=5`;
  
  const cardsRes = await fetch(cardsUrl, { headers: { 'Authorization': AUTH_HEADER } });
  
  // 3. PRINT THE HEADERS (This is the most important part!)
  console.log("\n--- 🧾 API HEADERS (Credit Check) ---");
  console.log(`Status Code: ${cardsRes.status}`);
  console.log(`X-RateLimit-Remaining: ${cardsRes.headers.get('x-ratelimit-remaining')}`);
  console.log(`X-API-Calls-Consumed: ${cardsRes.headers.get('x-api-calls-consumed')}`);
  console.log("-------------------------------------");

  const cardsJson = await cardsRes.json();
  const cards = cardsJson.data || [];

  if (cards.length === 0) {
    console.log(`⚠️ Result: 0 cards returned.`);
  } else {
    console.log(`✅ Result: ${cards.length} cards returned! (First: ${cards[0].name})`);
  }
}
run();
