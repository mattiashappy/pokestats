const API_BASE_URL = process.env.PT_API_BASE_URL || 'https://www.pokemonpricetracker.com/api/v2';
const API_TOKEN = process.env.PT_API_TOKEN; // Hämta nyckeln
const KEY_PREFIX = process.env.PT_API_KEY_PREFIX || 'Bearer';

async function run() {
  console.log("🔒 AUTH DEBUGGER");
  
  // 1. Kontrollera om variablerna finns
  if (!API_TOKEN) {
    console.error("❌ CRITICAL: PT_API_TOKEN is missing/undefined!");
    return;
  }

  // 2. Visa formatet på nyckeln (Säkert)
  const tokenLength = API_TOKEN.length;
  const firstChars = API_TOKEN.substring(0, 4);
  const lastChars = API_TOKEN.substring(tokenLength - 4);
  
  console.log(`🔑 Token Found: Yes`);
  console.log(`📏 Length: ${tokenLength} characters`);
  console.log(`👀 Preview: ${firstChars}...${lastChars}`);
  console.log(`🏷️ Prefix used: "${KEY_PREFIX}"`);
  
  // 3. Testa ett anrop mot "Base Set" (som vi vet har kort)
  const authHeader = `${KEY_PREFIX} ${API_TOKEN}`.trim();
  console.log(`\n📡 Sending request with Header: Authorization: ${KEY_PREFIX} [HIDDEN]`);

  // Vi söker specifikt på Base Set för att se om vi får 'cardCount: 102'
  const url = `${API_BASE_URL}/sets?search=Base%20Set&limit=1`;
  
  try {
    const res = await fetch(url, { headers: { 'Authorization': authHeader } });
    
    console.log(`\n📥 Response Status: ${res.status} ${res.statusText}`);
    
    // Check Headers again
    console.log(`   X-RateLimit-Remaining: ${res.headers.get('x-ratelimit-remaining')}`);
    
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      const set = json.data[0];
      console.log(`\n✅ Set Found: ${set.name}`);
      console.log(`   Card Count: ${set.cardCount}`); // Detta MÅSTE vara 102
    } else {
      console.log("⚠️ No sets found.");
    }

  } catch (err) {
    console.error("❌ Request Failed:", err.message);
  }
}
run();
