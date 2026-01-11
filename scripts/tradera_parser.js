function normalize(str) {
  return String(str || '').trim()
}

function normalizeCollectorNumber(prefix, number, total) {
  const cleanedNumber = String(number || '').trim()
  const cleanedTotal = String(total || '').trim()
  if (!cleanedNumber) return null
  if (cleanedTotal) {
    const cleanedPrefix = prefix ? String(prefix).toUpperCase().trim() : ''
    return `${cleanedPrefix}${cleanedNumber}/${cleanedTotal}`
  }
  return cleanedNumber
}

function parseCollectorKey(title) {
  // Match 252/198, 10/16, allow spaces around slash
  const cleaned = normalize(title)
  const match = cleaned.match(/\b([A-Za-z]{1,3})?\s*(\d{1,4})\s*\/\s*(\d{1,4})\b/)
  if (match) {
    return normalizeCollectorNumber(match[1], match[2], match[3])
  }

  const hashMatch = cleaned.match(/(?:#|no\.?\s*)(\d{1,4})\b/i)
  if (hashMatch) return normalizeCollectorNumber(null, hashMatch[1], null)

  return null
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
    { needle: 'pokemon rumble', hint: 'Pokémon Rumble' },
    { needle: 'pokémon rumble', hint: 'Pokémon Rumble' },
    { needle: 'jungle', hint: 'Jungle' },
    { needle: 'team rocket', hint: 'Team Rocket' },
    { needle: "rocket gang", hint: 'Team Rocket' },
    { needle: 'neo genesis', hint: 'Neo Genesis' },
    { needle: 'expedition', hint: 'Expedition' },
    { needle: 'skyridge', hint: 'Skyridge' },
    { needle: 'ex deoxys', hint: 'EX Deoxys' },
    { needle: 'delta species', hint: 'Delta Species' },
    { needle: 'fossil', hint: 'Fossil' },
    { needle: 'fire red', hint: 'FireRed & LeafGreen' },
    { needle: 'leaf green', hint: 'FireRed & LeafGreen' },
    { needle: 'lost origin', hint: 'Lost Origin' },
    { needle: 'paradox rift', hint: 'Paradox Rift' },
    { needle: 'ancient origins', hint: 'Ancient Origins' },
    { needle: 'twilight masquerade', hint: 'Twilight Masquerade' },
    { needle: 'astral radiance', hint: 'Astral Radiance' },
    { needle: 'paldea evolved', hint: 'Paldea Evolved' },
    { needle: 'journey together', hint: 'Journey Together' },
    { needle: 'phantasmal flames', hint: 'Phantasmal Flames' },
    { needle: 'destined rivals', hint: 'Destined Rivals' },
    { needle: 'breakthrough', hint: 'BREAKthrough' },
    { needle: 'breakpoint', hint: 'BREAKpoint' },
    { needle: 'topps', hint: 'Topps' }
  ]

  for (const m of mappings) {
    if (t.includes(m.needle)) return m.hint
  }
  const codeMatch = t.match(/\b(sfa|pre|pfl|blk|meg)\b/i)
  if (codeMatch) return codeMatch[1].toUpperCase()
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
