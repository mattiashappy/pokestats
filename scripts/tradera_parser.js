function normalize(str) {
  return String(str || '').trim()
}

function parseCollectorKey(title) {
  // Match 252/198, 10/16, allow spaces around slash
  const m = normalize(title).match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return null
  return `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`
}

function hasBundleSignals(title) {
  const t = normalize(title).toLowerCase()
  return (
    t.includes('samling') ||
    t.includes('lot') ||
    t.includes('kort ') && t.includes('st') || // crude but useful for "62st"
    t.includes('62st') ||
    t.includes('25stk') ||
    t.includes('två') ||
    t.includes('2 kort') ||
    t.includes('jumbo') && t.includes('promos') // often multi or non-standard
  )
}

function guessSetHint(title) {
  const t = normalize(title).toLowerCase()

  // Add more as you see patterns in your data
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

  for (const m of mappings) {
    if (t.includes(m.needle)) return m.hint
  }
  return null
}

function parseAuctionTitle(title) {
  const cleaned = normalize(title)
  const collectorKey = parseCollectorKey(cleaned)
  const setHint = guessSetHint(cleaned)

  return {
    title: cleaned,
    collectorKey,   // e.g. "252/198"
    setHint,        // human hint like "Base Set"
    isBundle: hasBundleSignals(cleaned)
  }
}

module.exports = { parseAuctionTitle }
