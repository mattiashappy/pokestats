const { importPriceTracker } = require('./pt_import')

console.log('PT_IMPORT_BOOT', { file: __filename, node: process.version })

importPriceTracker()
  .then((summary) => console.log('PT import complete', summary))
  .catch((err) => {
    console.error('PT import failed', err)
    process.exitCode = 1
  })
