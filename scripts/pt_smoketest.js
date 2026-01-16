heroku run "bash -lc 'cat > scripts/pt_smoketest.js <<EOF
const token = process.env.PT_API_TOKEN || process.env.PT_API_KEY || process.env.PRICE_TRACKER_TOKEN || process.env.PRICE_TRACKER_API_KEY;
if (!token) { console.error(\"No API token found in env\"); process.exit(1); }

async function test(url) {
  const res = await fetch(url, { headers: { Authorization: \`Bearer \${token}\` } });
  const text = await res.text();
  console.log(\"\\n===\", url);
  console.log(\"STATUS\", res.status);
  console.log(\"BODY\", text.slice(0, 500).replace(/\\s+/g, \" \"));
}

(async () => {
  await test(\"https://www.pokemonpricetracker.com/api/v2/sets\");
  await test(\"https://www.pokemonpricetracker.com/api/v2/cards?set=celebrations&fetchAllInSet=true\");
})().catch((e) => { console.error(\"SMOKETEST FAILED\", e); process.exit(1); });
EOF
chmod +x scripts/pt_smoketest.js
head -n 3 scripts/pt_smoketest.js'" -a pokestats
