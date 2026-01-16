const crypto = require('crypto')

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

function withLineNumbers(text) {
  return text
    .split('\n')
    .map((line, i) => String(i + 1).padStart(3, ' ') + ' | ' + line)
    .join('\n')
}

function countPlaceholders(sql) {
  const matches = sql.match(/\$\d+/g) || []
  // Unique placeholders ($1..$23). If someone duplicated $23 or skipped $14,
  // we still want to know.
  const unique = new Set(matches)
  return { total: matches.length, uniqueCount: unique.size, unique: [...unique].sort() }
}

function countInsertColumns(sql) {
  // Extract the column list between "INSERT INTO ... (" and ") VALUES"
  // This is safe here because our column list contains only identifiers.
  const m = sql.match(/INSERT\s+INTO\s+public\.pt_cards\s*\(([\s\S]*?)\)\s*VALUES/i)
  if (!m) return 0
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length
}

async function upsertCard(client, card) {
  const values = [
    card.ptCardId,
    card.tcgplayerProductId,
    card.ptSetId,
    card.setName,
    card.name,
    card.cardNumber,
    card.totalSetNumber,
    card.rarity,
    card.cardType,
    card.hp,
    card.stage,
    card.artist,
    card.tcgplayerUrl,
    card.imageCdnUrl,
    card.imageCdnUrl200,
    card.imageCdnUrl400,
    card.imageCdnUrl800,
    card.priceMarket,
    card.priceListings,
    card.pricePrimaryCondition,
    card.pricePrimaryPrinting,
    card.priceLastUpdated,
    card.updatedAt
  ]

  if (values.length !== 23) {
    throw new Error(`pt_cards upsert expected 23 values, got ${values.length}`)
  }

  const sql = `
INSERT INTO public.pt_cards (
  pt_card_id,
  tcgplayer_product_id,
  pt_set_id,
  set_name,
  name,
  card_number,
  total_set_number,
  rarity,
  card_type,
  hp,
  stage,
  artist,
  tcgplayer_url,
  image_cdn_url,
  image_cdn_url200,
  image_cdn_url400,
  image_cdn_url800,
  price_market,
  price_listings,
  price_primary_condition,
  price_primary_printing,
  price_last_updated,
  updated_at
)
VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15,
  $16, $17, $18, $19, $20,
  $21, $22, $23
)
ON CONFLICT (pt_card_id)
DO UPDATE SET
  tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
  pt_set_id = EXCLUDED.pt_set_id,
  set_name = EXCLUDED.set_name,
  name = EXCLUDED.name,
  card_number = EXCLUDED.card_number,
  total_set_number = EXCLUDED.total_set_number,
  rarity = EXCLUDED.rarity,
  card_type = EXCLUDED.card_type,
  hp = EXCLUDED.hp,
  stage = EXCLUDED.stage,
  artist = EXCLUDED.artist,
  tcgplayer_url = EXCLUDED.tcgplayer_url,
  image_cdn_url = EXCLUDED.image_cdn_url,
  image_cdn_url200 = EXCLUDED.image_cdn_url200,
  image_cdn_url400 = EXCLUDED.image_cdn_url400,
  image_cdn_url800 = EXCLUDED.image_cdn_url800,
  price_market = EXCLUDED.price_market,
  price_listings = EXCLUDED.price_listings,
  price_primary_condition = EXCLUDED.price_primary_condition,
  price_primary_printing = EXCLUDED.price_primary_printing,
  price_last_updated = EXCLUDED.price_last_updated,
  updated_at = COALESCE(EXCLUDED.updated_at, now())
`.trim()

  // --- Definitive runtime proof ---
  const cols = countInsertColumns(sql)
  const ph = countPlaceholders(sql)

  console.log('PT_UPSERT_CARD_FILE', __filename)
  console.log('PT_UPSERT_CARD_SQL_HASH', hashText(sql))
  console.log('PT_UPSERT_CARD_VALUES_LEN', values.length)
  console.log('PT_UPSERT_CARD_COLS', cols)
  console.log('PT_UPSERT_CARD_PH_TOTAL', ph.total)
  console.log('PT_UPSERT_CARD_PH_UNIQUE', ph.uniqueCount)
  // Uncomment if needed:
  // console.log('PT_UPSERT_CARD_PH_LIST', ph.unique)

  // Hard guard: if this fails, the SQL string is truly not what we expect
  if (cols !== 23 || ph.uniqueCount !== 23 || values.length !== 23) {
    console.error('PT_UPSERT_CARD_SQL_WITH_LINES\n' + withLineNumbers(sql))
    throw new Error(`pt_cards upsert guard failed: cols=${cols} phUnique=${ph.uniqueCount} bind=${values.length}`)
  }

  try {
    await client.query(sql, values)
  } catch (err) {
    console.error('PT_UPSERT_CARD_QUERY_ERROR', err.code, err.message)
    console.error('PT_UPSERT_CARD_SQL_WITH_LINES\n' + withLineNumbers(sql))
    // Also dump the first few values to ensure nothing weird like arrays sneaking in
    console.error('PT_UPSERT_CARD_SAMPLE_VALUES', values.slice(0, 5))
    throw err
  }
}
