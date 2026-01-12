const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const DATA_DIR = path.join(__dirname, '..', 'data', 'tradera-json')

function normalizeAuctionPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.auctions)) return payload.auctions
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function parseNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseTimestamp(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function normalizeString(value) {
  if (value === undefined || value === null) return null
  const str = String(value).trim()
  return str ? str : null
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined && entry !== null)
  if (value === undefined || value === null || value === '') return null
  return [value]
}

function mapAuctionFields(auction) {
  const itemId = parseNumber(pickFirstValue(auction, ['item_id', 'itemId', 'id', 'ItemId']))
  const categoryId = parseNumber(pickFirstValue(auction, ['category_id', 'categoryId', 'CategoryId']))
  const endDate = parseTimestamp(pickFirstValue(auction, ['end_date', 'endDate', 'endTime', 'end_time']))

  if (!itemId || !categoryId || !endDate) {
    return {
      error: 'missing_required_fields',
      itemId
    }
  }

  return {
    itemId,
    categoryId,
    endDate,
    price: parseNumber(pickFirstValue(auction, ['price', 'finalPrice', 'buyNowPrice'])),
    bidCount: parseNumber(pickFirstValue(auction, ['bid_count', 'bidCount', 'bids'])),
    sellerId: parseNumber(pickFirstValue(auction, ['seller_id', 'sellerId'])),
    sellerAlias: normalizeString(pickFirstValue(auction, ['seller_alias', 'sellerAlias', 'seller'])),
    title: normalizeString(pickFirstValue(auction, ['title', 'itemTitle', 'name'])),
    itemUrl: normalizeString(pickFirstValue(auction, ['item_url', 'itemUrl', 'url', 'itemLink'])),
    thumbnailUrl: normalizeString(pickFirstValue(auction, ['thumbnail_url', 'thumbnailUrl', 'thumbnail'])),
    traderaAttributes: pickFirstValue(auction, ['tradera_attributes', 'traderaAttributes', 'attributes']) ?? null,
    imageUrls: normalizeArray(pickFirstValue(auction, ['image_urls', 'imageUrls', 'images', 'image'])),
    description: normalizeString(pickFirstValue(auction, ['description', 'itemDescription'])),
    itemCondition: normalizeString(pickFirstValue(auction, ['item_condition', 'condition'])),
    pokemonEra: normalizeString(pickFirstValue(auction, ['pokemon_era', 'pokemonEra'])),
    pokemonLanguage: normalizeString(pickFirstValue(auction, ['pokemon_language', 'pokemonLanguage'])),
    raw: auction
  }
}

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => path.join(directory, file))
}

async function importAuctions() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set')
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  })

  const files = listJsonFiles(DATA_DIR)
  if (!files.length) {
    console.log('No JSON files found in data/tradera-json')
    await pool.end()
    return
  }

  const summary = {
    files: files.length,
    received: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const filePath of files) {
      const payload = readJsonFile(filePath)
      const auctions = normalizeAuctionPayload(payload)
      summary.received += auctions.length

      for (const [index, auction] of auctions.entries()) {
        const mapped = mapAuctionFields(auction)
        if (mapped.error) {
          summary.skipped += 1
          if (summary.errors.length < 20) {
            summary.errors.push({
              file: path.basename(filePath),
              index,
              itemId: mapped.itemId ?? null,
              reason: mapped.error
            })
          }
          continue
        }

        const values = [
          mapped.itemId,
          mapped.categoryId,
          mapped.endDate,
          mapped.price,
          mapped.bidCount,
          mapped.sellerId,
          mapped.sellerAlias,
          mapped.title,
          mapped.itemUrl,
          mapped.thumbnailUrl,
          mapped.traderaAttributes,
          mapped.imageUrls,
          mapped.description,
          mapped.itemCondition,
          mapped.pokemonEra,
          mapped.pokemonLanguage,
          mapped.raw
        ]

        const { rows } = await client.query(
          `
            INSERT INTO public.tradera_auctions (
              item_id,
              category_id,
              end_date,
              price,
              bid_count,
              seller_id,
              seller_alias,
              title,
              item_url,
              thumbnail_url,
              tradera_attributes,
              image_urls,
              description,
              item_condition,
              pokemon_era,
              pokemon_language,
              raw,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now()
            )
            ON CONFLICT (item_id)
            DO UPDATE SET
              category_id = EXCLUDED.category_id,
              end_date = EXCLUDED.end_date,
              price = EXCLUDED.price,
              bid_count = EXCLUDED.bid_count,
              seller_id = EXCLUDED.seller_id,
              seller_alias = EXCLUDED.seller_alias,
              title = EXCLUDED.title,
              item_url = EXCLUDED.item_url,
              thumbnail_url = EXCLUDED.thumbnail_url,
              tradera_attributes = EXCLUDED.tradera_attributes,
              image_urls = EXCLUDED.image_urls,
              description = EXCLUDED.description,
              item_condition = EXCLUDED.item_condition,
              pokemon_era = EXCLUDED.pokemon_era,
              pokemon_language = EXCLUDED.pokemon_language,
              raw = EXCLUDED.raw,
              updated_at = now()
            RETURNING (xmax = 0) AS inserted
          `,
          values
        )

        if (rows[0]?.inserted) {
          summary.inserted += 1
        } else {
          summary.updated += 1
        }
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  console.log(JSON.stringify(summary, null, 2))
}

importAuctions().catch((error) => {
  console.error('Failed to import tradera JSON auctions', error)
  process.exitCode = 1
})
