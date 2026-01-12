const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const { ERA_DEFINITIONS, resolveEraCode } = require('../server/era')

const dataRoot = path.join(__dirname, '..', 'data')
const expansionsPath = path.join(dataRoot, 'expansions.json')

async function readJson(filePath) {
  const contents = await fs.promises.readFile(filePath, 'utf8')
  return JSON.parse(contents)
}

async function getTableColumns(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  )
  return new Set(rows.map((row) => row.column_name))
}

function buildEraUpsert(columns) {
  const insertColumns = ['code', 'name', 'sort_order', 'start_year', 'end_year'].filter((column) =>
    columns.has(column)
  )

  if (!insertColumns.includes('code')) {
    return null
  }

  const updates = insertColumns.filter((column) => column !== 'code')
  const updateClause = updates.length
    ? `DO UPDATE SET ${updates.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`
    : 'DO NOTHING'

  return {
    insertColumns,
    updateClause
  }
}

async function upsertEras(client) {
  const tables = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'eras'
    `
  )

  if (tables.rows.length === 0) {
    console.warn('Skipping era import because public.eras table does not exist.')
    return {}
  }

  const columns = await getTableColumns(client, 'eras')
  const upsertSpec = buildEraUpsert(columns)

  if (!upsertSpec) {
    console.warn('Skipping era import because public.eras is missing a code column.')
    return {}
  }

  const eraIdByCode = {}

  for (const era of ERA_DEFINITIONS) {
    const params = upsertSpec.insertColumns.map((column) => {
      if (column === 'code') return era.code
      if (column === 'name') return era.name
      if (column === 'sort_order') return era.sort_order ?? null
      if (column === 'start_year') return era.start_year ?? null
      if (column === 'end_year') return era.end_year ?? null
      return null
    })

    const placeholders = upsertSpec.insertColumns.map((_, index) => `$${index + 1}`).join(', ')

    const result = await client.query(
      `
        INSERT INTO public.eras (${upsertSpec.insertColumns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (code)
        ${upsertSpec.updateClause}
        RETURNING id, code, name
      `,
      params
    )

    const row = result.rows[0]
    if (row?.id && row?.code) {
      eraIdByCode[row.code] = row.id
      if (row.name) {
        eraIdByCode[row.name] = row.id
      }
    }
  }

  return eraIdByCode
}

function buildExpansionRows(expansions) {
  return expansions.map((expansion) => {
    const name = expansion.set_name ?? expansion.name ?? null
    return {
      set_code: expansion.set_code,
      set_name: name,
      name,
      era: expansion.era ?? null,
      language: expansion.language ?? null,
      set_total: expansion.set_total ?? null,
      release_date: expansion.release_date ?? null,
      image_url: expansion.image_url ?? null,
      base_total: expansion.base_total ?? expansion.set_number ?? expansion.cards_in_set ?? null,
      set_number: expansion.set_number ?? null,
      cards_in_set: expansion.cards_in_set ?? null
    }
  })
}

function buildExpansionUpsert(columns) {
  if (!columns.has('set_code')) return null

  const insertColumns = ['set_code']
  const optionalColumns = [
    'set_name',
    'name',
    'era',
    'language',
    'set_total',
    'release_date',
    'image_url',
    'base_total',
    'set_number',
    'cards_in_set',
    'era_id'
  ]

  for (const column of optionalColumns) {
    if (columns.has(column)) {
      insertColumns.push(column)
    }
  }

  const updates = insertColumns.filter((column) => column !== 'set_code')
  const updateClause = updates.length
    ? `DO UPDATE SET ${updates.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`
    : 'DO NOTHING'

  return {
    insertColumns,
    updateClause
  }
}

async function upsertExpansions(client, expansions, eraIdByCode) {
  const columns = await getTableColumns(client, 'expansions')
  const upsertSpec = buildExpansionUpsert(columns)

  if (!upsertSpec) {
    throw new Error('public.expansions is missing set_code column.')
  }

  const expansionRows = buildExpansionRows(expansions)

  for (const row of expansionRows) {
    const eraCode = resolveEraCode(row.era)
    const eraId = columns.has('era_id') && eraCode ? eraIdByCode[eraCode] ?? eraIdByCode[row.era] ?? null : null

    const params = upsertSpec.insertColumns.map((column) => {
      if (column === 'era_id') return eraId
      return row[column] ?? null
    })

    const placeholders = upsertSpec.insertColumns.map((_, index) => `$${index + 1}`).join(', ')

    await client.query(
      `
        INSERT INTO public.expansions (${upsertSpec.insertColumns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (set_code)
        ${upsertSpec.updateClause}
      `,
      params
    )
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to import eras/sets.')
  }

  const expansions = await readJson(expansionsPath)
  if (!Array.isArray(expansions)) {
    throw new Error('Expansions data must be an array.')
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const eraIdByCode = await upsertEras(client)
    await upsertExpansions(client, expansions, eraIdByCode)

    await client.query('COMMIT')
    console.info(`Imported/updated ${expansions.length} expansions and ${ERA_DEFINITIONS.length} eras.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error) => {
  console.error('Era/set import failed:', error)
  process.exitCode = 1
})
