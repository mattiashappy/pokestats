function normalize(str) {
  return String(str || '').trim()
}

function parseCollectorKey(title) {
  const match = normalize(title).match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return null
  return `${Number.parseInt(match[1], 10)}/${Number.parseInt(match[2], 10)}`
}

function hasBundleSignals(title) {
  const text = normalize(title).toLowerCase()
  return (
    text.includes('samling') ||
    text.includes('lot') ||
    (text.includes('kort ') && text.includes('st')) ||
    text.includes('62st') ||
    text.includes('25stk') ||
    text.includes('två') ||
    text.includes('2 kort') ||
    (text.includes('jumbo') && text.includes('promos'))
  )
}

function guessSetHint(title) {
  const text = normalize(title).toLowerCase()
  const mappings = [
    { needle: 'base set 2', hint: 'Base Set 2' },
    { needle: 'base set', hint: 'Base Set' },
    { needle: 'jungle', hint: 'Jungle' },
    { needle: 'team rocket', hint: 'Team Rocket' },
    { needle: 'neo genesis', hint: 'Neo Genesis' },
    { needle: 'expedition', hint: 'Expedition' },
    { needle: 'skyridge', hint: 'Skyridge' },
    { needle: 'fire red', hint: 'FireRed & LeafGreen' },
    { needle: 'leaf green', hint: 'FireRed & LeafGreen' },
    { needle: 'lost origin', hint: 'Lost Origin' },
    { needle: 'paradox rift', hint: 'Paradox Rift' },
    { needle: 'ancient origins', hint: 'Ancient Origins' },
    { needle: 'breakthrough', hint: 'BREAKthrough' },
    { needle: 'breakpoint', hint: 'BREAKpoint' }
  ]

  for (const mapping of mappings) {
    if (text.includes(mapping.needle)) return mapping.hint
  }

  return null
}

function parseAuctionTitle(title) {
  const cleaned = normalize(title)
  const collectorKey = parseCollectorKey(cleaned)
  const setHint = guessSetHint(cleaned)

  return {
    collectorKey,
    setHint,
    isBundle: hasBundleSignals(cleaned)
  }
}

module.exports = { parseAuctionTitle }
