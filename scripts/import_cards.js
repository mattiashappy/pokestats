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

  const match = normalized.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) {
    return {
      collectorNumberRaw: normalized,
      collectorKey: null,
      number: null,
      printedTotal: null,
      isSecret: null
    }
  }

  const number = Number.parseInt(match[1], 10)
  const printedTotal = Number.parseInt(match[2], 10)
  if (!Number.isFinite(number) || !Number.isFinite(printedTotal)) {
    return {
      collectorNumberRaw: normalized,
      collectorKey: null,
      number: null,
      printedTotal: null,
      isSecret: null
    }
  }

  return {
    collectorNumberRaw: normalized,
    collectorKey: `${number}/${printedTotal}`,
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
    const result = await client.query(
      `
        INSERT INTO public.expansions (set_code, set_name, era, base_total, set_total)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (set_code) DO UPDATE SET
          set_name = EXCLUDED.set_name,
          era = EXCLUDED.era,
          base_total = EXCLUDED.base_total,
          set_total = EXCLUDED.set_total
        RETURNING id
      `,
      [
        expansion.set_code,
        expansion.name ?? null,
        expansion.era ?? null,
        expansion.set_number ?? expansion.cards_in_set ?? null,
        expansion.set_total ?? null
      ]
    )

    expansionIdByCode[expansion.set_code] = result.rows[0].id
  }

  return expansionIdByCode
}

function buildCardRows(expansion, cardsEntry, expansionId) {
  const setTotal = cardsEntry.set_total ?? expansion.set_total ?? expansion.set_number ?? null
  return cardsEntry.cards.map((card) => {
    const parsed = parseCollectorNumber(card.card_number)

    return {
      expansion_id: expansionId,
      name: card.name ?? null,
      collector_number_raw: parsed.collectorNumberRaw,
      collector_key: parsed.collectorKey,
      number: parsed.number,
      printed_total: parsed.printedTotal,
      is_secret: parsed.isSecret,
      image_url: card.image_url ?? null,
      source: 'json',
      set_code: expansion.set_code,
      set_total: setTotal,
      product_details: card.product_details ?? null,
      card_number: card.card_number ? String(card.card_number) : null
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
        params.push(row[column])
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
          image_url = EXCLUDED.image_url,
          source = EXCLUDED.source,
          set_code = EXCLUDED.set_code,
          set_total = EXCLUDED.set_total,
          product_details = EXCLUDED.product_details
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
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { expansions, cardsBySetCode } = await loadCatalog()
    const expansionIdByCode = await upsertExpansions(client, expansions)

    let totalCards = 0
    for (const expansion of expansions) {
      const cardsEntry = cardsBySetCode[expansion.set_code]
      if (!cardsEntry?.cards?.length) continue

      const expansionId = expansionIdByCode[expansion.set_code]
      if (!expansionId) {
        throw new Error(`Missing expansion_id for set_code ${expansion.set_code}`)
      }

      const cardRows = buildCardRows(expansion, cardsEntry, expansionId)
      totalCards += cardRows.length
      await insertCards(client, cardRows, batchSize)
    }

    await client.query('COMMIT')
    console.info(`Imported ${totalCards} cards from JSON files.`)
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
