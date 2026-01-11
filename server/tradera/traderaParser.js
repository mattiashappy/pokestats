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

function normalizeSetText(text) {
  return normalize(text)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SET_ALIASES = new Map([
  ['mega evolution', 'MEGA_EVOLUTION'],
  ['megaevolution', 'MEGA_EVOLUTION'],
  ['meg', 'MEGA_EVOLUTION'],
  ['base set 2', 'Base Set 2'],
  ['base set', 'Base Set'],
  ['jungle', 'Jungle'],
  ['team rocket', 'Team Rocket'],
  ['rocket gang', 'Team Rocket'],
  ['neo genesis', 'Neo Genesis'],
  ['expedition', 'Expedition'],
  ['skyridge', 'Skyridge'],
  ['ex deoxys', 'EX Deoxys'],
  ['delta species', 'EX_DELTA_SPECIES'],
  ['fossil', 'Fossil'],
  ['fire red', 'FireRed & LeafGreen'],
  ['leaf green', 'FireRed & LeafGreen'],
  ['lost origin', 'Lost Origin'],
  ['paradox rift', 'Paradox Rift'],
  ['ancient origins', 'Ancient Origins'],
  ['twilight masquerade', 'Twilight Masquerade'],
  ['astral radiance', 'Astral Radiance'],
  ['paldea evolved', 'Paldea Evolved'],
  ['journey together', 'Journey Together'],
  ['phantasmal flames', 'Phantasmal Flames'],
  ['destined rivals', 'Destined Rivals'],
  ['breakthrough', 'BREAKthrough'],
  ['breakpoint', 'BREAKpoint'],
  ['pfl', 'PHANTASMAL_FLAMES']
])

function extractDetectedSetCode(title) {
  const raw = String(title || '')
  const match = raw.match(/Detected set\s+.*?[•·\-\u2022]\s*([A-Z0-9_]{2,})/i)
  return match ? match[1].toUpperCase() : null
}

function guessSetHint(title) {
  if (!title) return null

  const detectedCode = extractDetectedSetCode(title)
  if (detectedCode) return detectedCode

  const normalized = normalizeSetText(title)
  if (!normalized) return null

  for (const [alias, code] of SET_ALIASES.entries()) {
    if (normalized.includes(alias)) return code
  }

  const tokens = new Set(normalized.split(' '))
  if (tokens.has('meg')) return 'MEGA_EVOLUTION'

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
