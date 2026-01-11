const { Pool } = require('pg')
const { linkAuctions } = require('../server/tradera/traderaLinker')

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

function formatSkipReasons(skipReasons) {
  const entries = Object.entries(skipReasons)
  if (!entries.length) return 'No skips.'

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ')
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
    const result = await linkAuctions({ client, limit })
    console.log(`Linking done. linked=${result.linked}, skipped=${result.skipped}, scanned=${result.scanned}`)
    console.log(`Skip reasons: ${formatSkipReasons(result.skipReasons)}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Failed to link auctions', error)
  process.exit(1)
})
