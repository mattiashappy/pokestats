const { importPriceTracker } = require('./pt_import')

console.log('PT_IMPORT_BOOT', { file: __filename, node: process.version })

importPriceTracker({
  limitSets: Number(process.env.PT_LIMIT_SETS || 50),
  limitCards: Number(process.env.PT_LIMIT_CARDS || 100),
  dryRun: process.env.PT_DRY_RUN === 'true'
})
  .then((summary) => console.log('PT import complete', summary))
  .catch((err) => {
    console.error('PT import failed', err)
    process.exitCode = 1
  })
