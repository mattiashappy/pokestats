#!/usr/bin/env node
const { runEnrichmentJob, pool } = require('../server')

async function main() {
  const limitArg = Number(process.argv[2])
  const limit = Number.isFinite(limitArg) ? limitArg : undefined
  const logPrefix = `[Enrichment job @ ${new Date().toISOString()}]`

  const result = await runEnrichmentJob({ limit, logPrefix })
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    if (pool) await pool.end()
  })
