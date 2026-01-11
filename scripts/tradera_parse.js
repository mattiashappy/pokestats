const { Pool } = require('pg')
const { parseAuctions } = require('../server/tradera/traderaLinker')

function buildPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  })
}

function parseLimit(argvValue) {
  const numeric = Number(argvValue)
  if (!Number.isFinite(numeric)) return 500
  return Math.min(Math.max(numeric, 1), 5000)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const limit = parseLimit(process.argv[2])
  const pool = buildPool()
  const client = await pool.connect()

  try {
    const result = await parseAuctions({ client, limit })
    console.log(
      `Parsed ${result.total} auctions • ${result.withCollectorKey} with card # • ${result.withSetHints} with set hints • ${result.bundles} bundles`
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Failed to parse auctions', error)
  process.exit(1)
})
