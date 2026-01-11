const { Pool } = require('pg')
const { loadCatalog } = require('../server/catalog/catalogLoader')

const DEFAULT_BATCH_SIZE = 500

function parseCollectorNumber(rawValue) {
  const normalized = String(rawValue || '').trim()
  if (!normalized) {
    return {
      collectorNumberRaw: null,
      collectorKey: null,
      number: null,
      printedTotal: null,
      isSecret: null
    }
  }

  // keep a raw representation even if we can't parse it
  const rawNoExtraSpaces = normalized.replace(/\s+/g, '')

  const match = rawNoExtraSpaces.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) {
    return {
      collectorNumberRaw: rawNoExtraSpaces,
      collectorKey: null,
      number: null,
      printedTotal: null,
      isSecret: null
    }
  }

  const normalizedCollectorKey = rawNoExtraSpaces
  const number = Number.parseInt(match[1], 10)
  const printedTotal = Number.parseInt(match[2], 10)
  if (!Number.isFinite(number) || !Number.isFinite(printedTotal)) {
    return {
      collectorNumberRaw: rawNoExtraSpaces,
      collectorKey: null,
      number: null,
      printedTotal: null,
      isSecret: null
    }
  }

  return {
    collectorNumberRaw: rawNoExtraSpaces,
    collectorKey: normalizedCollectorKey,
    number,
    printedTotal,
    isSecret: number > printedTotal
  }
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

    const setName = expansion.set_name ?? expansion.name ?? null
    if (!setName) {
      // DB requires NOT NULL set_name
      console.warn(`Skipping expansion ${setCode} because set_name is missing`)
      continue
    }

    const result = await client.query(
      `
        INSERT INTO public.expansions (set_code, set_name, era, base_total, set_total, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (set_code) DO UPDATE SET
          set_name = EXCLUDED.set_name,
          era = COALESCE(EXCLUDED.era, public.expansions.era),
          base_total = COALESCE(EXCLUDED.base_total, public.expansions.base_total),
          set_total = COALESCE(EXCLUDED.set_total, public.expansions.set_total),
          image_url = COALESCE(EXCLUDED.image_url, public.expansions.image_url)
        RETURNING id
      `,
      [
        setCode,
        setName,
        expansion.era ?? null,
        expansion.base_total ?? expansion.set_number ?? expansion.cards_in_set ?? null,
        expansion.set_total ?? null,
        expansion.image_url ?? null
      ]
    )

    expansionIdByCode[setCode] = result.rows[0].id
  }

  return expansionIdByCode
}

function buildCardRows(expansion, cardsEntry, expansionId) {
  const setTotal = cardsEntry.set_total ?? expansion.set_total ?? expansion.base_total ?? expansion.set_number ?? null

  return (cardsEntry.cards || []).map((card) => {
    const parsed = parseCollectorNumber(card.card_number)

    // cards.collector_number_raw is NOT NULL, so always fill it if possible
    const collectorNumberRaw = parsed.collectorNumberRaw ?? (card.card_number ? String(card.card_number).trim() : 'unknown')

    return {
      expansion_id: expansionId,
      name: card.name ?? null,
      collector_number_raw: collectorNumberRaw,
      collector_key: parsed.collectorKey,
      number: parsed.number,
      printed_total: parsed.printedTotal,
      is_secret: parsed.isSecret,
      image_url: card.image_url ?? null,
      source: 'json',
      set_code: expansion.set_code,
      set_total: setTotal,
      product_details: card.product_details ?? null,
      card_number: card.card_number ? String(card.card_number).replace(/\s+/g, '') : null
    }
  })
}

async function insertCards(client, cardRows, batchSize) {
  if (!cardRows.length) return

  const columns = [
    'expansion_id',
    'name',
    'collector_number_raw',
    'collector_key',
    'number',
    'printed_total',
    'is_secret',
    'image_url',
    'source',
    'set_code',
    'set_total',
    'product_details',
    'card_number'
  ]

  const chunks = chunkArray(cardRows, batchSize)
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

    await client.query(
      `
        INSERT INTO public.cards (${columns.join(', ')})
        VALUES ${values.join(', ')}
        ON CONFLICT (expansion_id, card_number) DO UPDATE SET
          name = EXCLUDED.name,
          collector_number_raw = EXCLUDED.collector_number_raw,
          collector_key = EXCLUDED.collector_key,
          number = EXCLUDED.number,
          printed_total = EXCLUDED.printed_total,
          is_secret = EXCLUDED.is_secret,
          image_url = COALESCE(EXCLUDED.image_url, public.cards.image_url),
          source = EXCLUDED.source,
          set_code = COALESCE(EXCLUDED.set_code, public.cards.set_code),
          set_total = COALESCE(EXCLUDED.set_total, public.cards.set_total),
          product_details = COALESCE(EXCLUDED.product_details, public.cards.product_details)
      `,
      params
    )
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to import cards.')
  }

  const batchSize = Number.parseInt(process.env.CARDS_IMPORT_BATCH_SIZE || '', 10) || DEFAULT_BATCH_SIZE

  // Heroku-safe SSL config
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
      const note = cardsBySetCode?.[expansion.set_code]
      if (!note?.cards?.length) continue

      const expansionId = expansionIdByCode[expansion.set_code]
      if (!expansionId) {
        console.warn(`Skipping set_code ${expansion.set_code} because expansion row was not created (missing set_name?)`)
        continue
      }

      const cardRows = buildCardRows(expansion, note, expansionId)

      // Filter out rows that would violate NOT NULL constraints
      const validRows = cardRows.filter((r) => r.expansion_id && r.name && r.collector_number_raw)

      totalCards += validRows.length
      await insertCards(client, validRows, batchSize)
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
