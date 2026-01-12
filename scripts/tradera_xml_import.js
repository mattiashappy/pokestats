const { spawnSync } = require('child_process')

function resolvePythonCommand() {
  return process.env.PYTHON_BIN || 'python'
}

function runImporter() {
  const pythonBin = resolvePythonCommand()
  const result = spawnSync(pythonBin, ['scripts/tradera_xml_import.py'], {
    stdio: 'inherit'
  })

  if (result.error) {
    console.error(`Failed to launch Python using "${pythonBin}".`)
    console.error('Set PYTHON_BIN to the correct executable if Python is not on PATH.')
    process.exitCode = 1
    return
  }

  process.exitCode = result.status ?? 1
}

runImporter()
