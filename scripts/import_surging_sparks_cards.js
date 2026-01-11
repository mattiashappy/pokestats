const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const SET_CODE = 'SURGING_SPARKS'
const SET_NAME = 'Surging Sparks'
const SET_TOTAL = 252
const DEFAULT_BATCH_SIZE = 200

function normalizeCollectorKey(raw) {
  if (!raw) return null
  const normalized = String(raw).trim()
  const match = normalized.match(/^0*(\d+)(\/\d+)?$/)
  if (!match) return normalized
  return `${match[1]}${match[2] || ''}`
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) return []
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function getColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  )

  return new Set(result.rows.map((row) => row.column_name))
}

async function ensureCollectorKeyIndex(client) {
  await client.query(
    `
      CREATE UNIQUE INDEX IF NOT EXISTS cards_expansion_collector_key_uq
      ON public.cards (expansion_id, collector_key)
      WHERE collector_key IS NOT NULL
    `
  )
}

async function resolveExpansion(client) {
  let result = await client.query(
    `
      SELECT id
      FROM public.expansions
      WHERE set_code = $1
      LIMIT 1
    `,
    [SET_CODE]
  )

  if (result.rows.length === 0) {
    result = await client.query(
      `
        SELECT id
        FROM public.expansions
        WHERE set_name ILIKE $1
        LIMIT 1
      `,
      [`%${SET_NAME}%`]
    )
  }

  if (result.rows.length > 0) {
    const expansionId = result.rows[0].id
    await client.query(
      `
        UPDATE public.expansions
        SET set_total = $1
        WHERE id = $2
      `,
      [SET_TOTAL, expansionId]
    )
    return expansionId
  }

  const insertResult = await client.query(
    `
      INSERT INTO public.expansions (set_code, set_name, set_total)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [SET_CODE, SET_NAME, SET_TOTAL]
  )

  return insertResult.rows[0].id
}

function buildCardRows(cards, expansionId, availableColumns) {
  const rows = cards.map((card) => {
    const collectorNumberRaw = card.card_number ? String(card.card_number).trim() : null
    return {
      expansion_id: expansionId,
      name: card.name ?? null,
      collector_number_raw: collectorNumberRaw,
      collector_key: normalizeCollectorKey(collectorNumberRaw),
      rarity: card.rarity ?? null,
      element: card.element ?? card.type ?? null,
      variant: card.variant ?? null,
      supertype: card.supertype ?? null,
      subtype: card.subtype ?? null
    }
  })

  const requiredColumns = ['expansion_id', 'name', 'collector_number_raw', 'collector_key']
  const optionalColumns = ['rarity', 'element', 'variant', 'supertype', 'subtype']
  const presentOptionalColumns = optionalColumns.filter((column) => availableColumns.has(column))
  const columns = requiredColumns.concat(presentOptionalColumns)

  return { rows, columns, optionalColumns: presentOptionalColumns }
}

async function upsertCards(client, rows, columns, batchSize) {
  const chunks = chunkArray(rows, batchSize)
  let inserted = 0
  let updated = 0

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

    const updateAssignments = columns
      .filter((column) => column !== 'expansion_id' && column !== 'collector_key')
      .map((column) => `${column} = EXCLUDED.${column}`)

    const result = await client.query(
      `
        INSERT INTO public.cards (${columns.join(', ')})
        VALUES ${values.join(', ')}
        ON CONFLICT (expansion_id, collector_key)
        DO UPDATE SET ${updateAssignments.join(', ')}
        RETURNING (xmax = 0) AS inserted
      `,
      params
    )

    for (const row of result.rows) {
      if (row.inserted) {
        inserted += 1
      } else {
        updated += 1
      }
    }
  }

  return { inserted, updated }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to import Surging Sparks cards.')
  }

  const batchSize = Number.parseInt(process.env.CARDS_IMPORT_BATCH_SIZE || '', 10) || DEFAULT_BATCH_SIZE
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })

  const cardsPath = path.join(__dirname, '..', 'data', 'cards', 'Surgingsparks.json')
  const cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf8'))
  const cards = Array.isArray(cardsData.cards) ? cardsData.cards : []

  console.log('First 10 cards from JSON:')
  cards.slice(0, 10).forEach((card, index) => {
    console.log(`${index + 1}. ${card.card_number} - ${card.name}`)
  })

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const cardsColumns = await getColumns(client, 'cards')
    const expansionsColumns = await getColumns(client, 'expansions')
    console.log('Cards columns:', Array.from(cardsColumns).join(', '))
    console.log('Expansions columns:', Array.from(expansionsColumns).join(', '))

    await ensureCollectorKeyIndex(client)
    const expansionId = await resolveExpansion(client)

    const { rows, columns, optionalColumns } = buildCardRows(cards, expansionId, cardsColumns)
    console.log('Optional columns used:', optionalColumns.length ? optionalColumns.join(', ') : 'none')

    const validRows = rows.filter((row) => row.expansion_id && row.name && row.collector_number_raw)
    const { inserted, updated } = await upsertCards(client, validRows, columns, batchSize)

    const totalResult = await client.query(
      `
        SELECT COUNT(*) AS count
        FROM public.cards
        WHERE expansion_id = $1
      `,
      [expansionId]
    )

    const duplicateResult = await client.query(
      `
        SELECT collector_key, COUNT(*) AS n
        FROM public.cards
        WHERE expansion_id = $1
        GROUP BY collector_key
        HAVING COUNT(*) > 1
        ORDER BY n DESC
      `,
      [expansionId]
    )

    const highestResult = await client.query(
      `
        SELECT collector_key, name
        FROM public.cards
        WHERE expansion_id = $1
        ORDER BY (regexp_replace(collector_key, '^([0-9]+).*$','\\1'))::int DESC
        LIMIT 5
      `,
      [expansionId]
    )

    await client.query('COMMIT')

    console.log(`Inserted: ${inserted}`)
    console.log(`Updated: ${updated}`)
    console.log(`Total cards for expansion ${expansionId}: ${totalResult.rows[0].count}`)

    if (duplicateResult.rows.length) {
      console.log('Duplicate collector keys found:')
      duplicateResult.rows.forEach((row) => {
        console.log(`${row.collector_key}: ${row.n}`)
      })
    } else {
      console.log('No duplicate collector keys found.')
    }

    console.log('Highest collector keys:')
    highestResult.rows.forEach((row) => {
      console.log(`${row.collector_key} - ${row.name}`)
    })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error) => {
  console.error('Surging Sparks import failed:', error)
  process.exitCode = 1
})
