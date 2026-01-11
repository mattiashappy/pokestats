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
  const cleaned = normalize(title)
  const tgMatch = cleaned.match(/\b(TG|GG)\s*(\d{1,2})\s*\/\s*\1\s*(\d{1,2})\b/i)
  if (tgMatch) {
    const prefix = tgMatch[1].toUpperCase()
    const number = tgMatch[2]
    const total = tgMatch[3]
    return {
      value: `${prefix}${number}/${prefix}${total}`,
      prefix,
      number,
      total,
      strength: 'strong',
      kind: prefix
    }
  }

  const ratioMatch = cleaned.match(/\b([A-Za-z]{1,3})?\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (ratioMatch) {
    return {
      value: normalizeCollectorNumber(ratioMatch[1], ratioMatch[2], ratioMatch[3]),
      prefix: ratioMatch[1] ? ratioMatch[1].toUpperCase().trim() : '',
      number: ratioMatch[2],
      total: ratioMatch[3],
      strength: 'strong',
      kind: 'ratio'
    }
  }

  const hashMatch = cleaned.match(/(?:#|no\.?\s*)(\d{1,4})\b/i)
  if (hashMatch) {
    return {
      value: normalizeCollectorNumber(null, hashMatch[1], null),
      prefix: '',
      number: hashMatch[1],
      total: null,
      strength: 'weak',
      kind: 'hash'
    }
  }

  return null
}

function hasBundleSignals(title) {
  const text = normalize(title).toLowerCase()
  return (
    /\b(lot|paket|samling|bundle|bulk)\b/.test(text) ||
    /\b\d+\s*(st|pcs)\b/.test(text) ||
    text.includes('jumbo') ||
    /\bpromos?\b/.test(text)
  )
}

function isTopps(title) {
  return normalize(title).toLowerCase().includes('topps')
}

function isSpecialProductLine(title) {
  return /\b(rumble|countdown)\b/i.test(title)
}

function guessSetHint(title) {
  const text = normalize(title).toLowerCase()
  const mappings = [
    { needle: 'base set 2', hint: 'Base Set 2' },
    { needle: 'base set', hint: 'Base Set' },
    { needle: 'jungle', hint: 'Jungle' },
    { needle: 'team rocket', hint: 'Team Rocket' },
    { needle: "rocket gang", hint: 'Team Rocket' },
    { needle: 'neo genesis', hint: 'Neo Genesis' },
    { needle: 'expedition', hint: 'Expedition' },
    { needle: 'skyridge', hint: 'Skyridge' },
    { needle: 'ex deoxys', hint: 'EX Deoxys' },
    { needle: 'delta species', hint: 'EX_DELTA_SPECIES' },
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
    { needle: 'breakpoint', hint: 'BREAKpoint' }
  ]

  for (const mapping of mappings) {
    if (text.includes(mapping.needle)) return mapping.hint
  }

  const codeMatch = text.match(/\b(pfl|meg)\b/i)
  if (codeMatch) {
    const aliasMap = {
      PFL: 'PHANTASMAL_FLAMES',
      MEG: 'MEGA_EVOLUTION'
    }
    return aliasMap[codeMatch[1].toUpperCase()] || null
  }

  return null
}

function parseAuctionTitle(title) {
  const cleaned = normalize(title)
  const collectorKey = parseCollectorKey(cleaned)
  const setHint = guessSetHint(cleaned)
  const topps = isTopps(cleaned)
  const bundle = hasBundleSignals(cleaned)
  const specialProduct = isSpecialProductLine(cleaned)
  let skipReason = null

  if (topps) {
    skipReason = 'non_tcg_topps'
  } else if (bundle) {
    skipReason = 'bundle_or_bulk'
  } else if (specialProduct) {
    skipReason = 'special_product_line'
  }

  return {
    collectorKey,
    collectorKeyStrength: collectorKey ? collectorKey.strength : null,
    setHint,
    isBundle: bundle,
    isTopps: topps,
    skipReason
  }
}

module.exports = { parseAuctionTitle }
