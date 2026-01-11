const { Pool } = require('pg')
const { loadCatalog } = require('../server/catalog/catalogLoader')

const DEFAULT_BATCH_SIZE = 500

function normalizeCardNumber(rawValue) {
  const normalized = String(rawValue || '').trim()
  if (!normalized) return null
  // Remove spaces around slashes etc. "10 / 16" -> "10/16"
  return normalized.replace(/\s+/g, '')
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) return []
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function upsertExpansions(client, expansions) {
  const expansionIdByCode = {}

  for (const expansion of expansions) {
    const setCode = expansion.set_code
    if (!setCode) continue

    // Map whatever your catalog loader provides to your DB schema
    const name = expansion.name ?? expansion.set_name ?? null
    const era = expansion.era ?? null
    const language = expansion.language ?? 'EN'
    const setTotal =
      expansion.set_total ??
      expansion.set_number ??
      expansion.cards_in_set ??
      null

    const releaseDate = expansion.release_date ?? null
    const imageUrl = expansion.image_url ?? null

    const result = await client.query(
      `
        INSERT INTO public.expansions (set_code, name, era, language, set_total, release_date, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (set_code) DO UPDATE SET
          name = EXCLUDED.name,
          era = COALESCE(EXCLUDED.era, public.expansions.era),
          language = COALESCE(EXCLUDED.language, public.expansions.language),
          set_total = COALESCE(EXCLUDED.set_total, public.expansions.set_total),
          release_date = COALESCE(EXCLUDED.release_date, public.expansions.release_date),
          image_url = COALESCE(EXCLUDED.image_url, public.expansions.image_url)
        RETURNING id
      `,
      [setCode, name, era, language, setTotal, releaseDate, imageUrl]
    )

    expansionIdByCode[setCode] = result.rows[0].id
  }

  return expansionIdByCode
}

function buildCardRows(expansion, cardsEntry, expansionId) {
  const setCode = expansion.set_code
  const setName =
    cardsEntry.set_name ??
    expansion.name ??
    expansion.set_name ??
    null

  const setTotal =
    cardsEntry.set_total ??
    expansion.set_total ??
    expansion.set_number ??
    expansion.cards_in_set ??
    null

  return (cardsEntry.cards || []).map((card) => {
    const cardNumber = normalizeCardNumber(card.card_number)
    return {
      expansion_id: expansionId,
      name: card.name ?? null,
      era: card.era ?? expansion.era ?? null,
      set_name: setName,
      card_number: cardNumber,
      set_code: setCode,
      set_total: setTotal,
      source: 'json',
      image_url: card.image_url ?? null,
      product_details: card.product_details ?? null
    }
  })
}

async function insertCards(client, cardRows, batchSize) {
  // Only insert rows that have the minimum keys to satisfy NOT NULL + uniqueness
  const filtered = cardRows.filter((r) => r.set_code && r.card_number && r.set_name && r.name)
  if (!filtered.length) return 0

  const columns = [
    'expansion_id',
    'name',
    'era',
    'set_name',
    'card_number',
    'set_code',
    'set_total',
    'source',
    'image_url',
    'product_details'
  ]

  const chunks = chunkArray(filtered, batchSize)
  let insertedOrUpdated = 0

  for (const chunk of chunks) {
    const values = []
    const params = []
    let index = 1

    for (const row of chunk) {
      values.push(`(${columns.map(() => `$${index++}`).join(', ')})`)
      for (const column of columns) {
        params.push(row[column] ?? null)
      }
    }

    // Your table has UNIQUE (set_code, card_number)
    await client.query(
      `
        INSERT INTO public.cards (${columns.join(', ')})
        VALUES ${values.join(', ')}
        ON CONFLICT (set_code, card_number) DO UPDATE SET
          name = EXCLUDED.name,
          era = COALESCE(EXCLUDED.era, public.cards.era),
          set_name = EXCLUDED.set_name,
          set_total = COALESCE(EXCLUDED.set_total, public.cards.set_total),
          source = EXCLUDED.source,
          expansion_id = COALESCE(EXCLUDED.expansion_id, public.cards.expansion_id),
          image_url = COALESCE(EXCLUDED.image_url, public.cards.image_url),
          product_details = COALESCE(EXCLUDED.product_details, public.cards.product_details)
      `,
      params
    )

    insertedOrUpdated += chunk.length
  }

  return insertedOrUpdated
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to import cards.')
  }

  const batchSize = Number.parseInt(process.env.CARDS_IMPORT_BATCH_SIZE || '', 10) || DEFAULT_BATCH_SIZE

  // ✅ Heroku-friendly SSL. Works on Heroku Postgres.
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { expansions, cardsBySetCode } = await loadCatalog()
    const expansionIdByCode = await upsertExpansions(client, expansions)

    let totalCards = 0

    for (const expansion of expansions) {
      const setCode = expansion.set_code
      if (!setCode) continue

      const cardsEntry = cardsBySetCode[setCode]
      if (!cardsEntry?.cards?.length) continue

      const expansionId = expansionIdByCode[setCode]
      if (!expansionId) {
        throw new Error(`Missing expansion_id for set_code ${setCode}`)
      }

      const cardRows = buildCardRows(expansion, cardsEntry, expansionId)
      const processed = await insertCards(client, cardRows, batchSize)
      totalCards += processed
    }

    await client.query('COMMIT')
    console.info(`Imported/updated ${totalCards} cards from JSON files.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error) => {
  console.error('Card import failed:', error)
  process.exitCode = 1
})