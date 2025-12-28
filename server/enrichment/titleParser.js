const SET_ALIASES = [
  { set: 'Fusion Strike', aliases: ['fusion strike', 'fs', 'swsh08'] },
  { set: 'Base Set', aliases: ['base set', 'baseset'] },
  { set: 'Jungle', aliases: ['jungle'] },
  { set: 'Gym Heroes', aliases: ['gym heroes'] },
  { set: 'Paldea Evolved', aliases: ['paldea evolved'] },
  { set: 'Celebrations', aliases: ['celebrations'] }
]

const STOPWORDS = [
  'pokemonkort',
  'pokémonkort',
  'pokemon kort',
  'pokémon kort',
  'pokemon',
  'pokémon',
  'ultra rare',
  'rare',
  'holo',
  'nm',
  'reverse',
  'tcg',
  'vintage',
  'nintendo',
  'original',
  'samfrakt',
  'first edition',
  'edition'
]

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripNoise(s) {
  let out = ` ${normalize(s)} `
  for (const w of STOPWORDS) {
    out = out.replaceAll(` ${w} `, ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

function extractSetCode(titleNorm) {
  // Examples:
  // "sv4a", "sv04", "sv5a", "sv7a"
  const sv = titleNorm.match(/\bsv\s*0?(\d{1,2})([a-z])?\b/i)
  if (sv) {
    const num = String(Number(sv[1])).padStart(2, "0") // 4 -> "04"
    const suffix = sv[2] ? sv[2].toUpperCase() : ""
    return `SV${num}${suffix}`
  }

  // SWSH promo codes: SWSH134 etc (not set_code, but still useful)
  // You can decide mapping later. For now: return null.

  return null
}

function detectSet(title) {
  const t = normalize(title)
  for (const entry of SET_ALIASES) {
    for (const a of entry.aliases) {
      if (t.includes(a)) return { setGuess: entry.set, setAlias: a, confidence: 80 }
    }
  }
  return { setGuess: null, setAlias: null, confidence: 0 }
}

function extractNumberText(title) {
  const t = normalize(title)

  const frac = t.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (frac) {
    const cardNo = Number(frac[1])
    const total = Number(frac[2])
    return { numberText: `${cardNo}/${total}`, cardNo, totalInSet: total }
  }

  const promoMatch = title.match(/\b((?:[A-Z]{2,6}SH|SWSH|SM|XY)\d{1,4})\b/i)
  if (promoMatch) {
    return { numberText: promoMatch[1].toUpperCase(), cardNo: null, totalInSet: null }
  }

  const hash = t.match(/#\s*(\d{1,3})\b/)
  if (hash) {
    const cardNo = Number(hash[1])
    return { numberText: `${cardNo}`, cardNo, totalInSet: null }
  }

  const three = t.match(/\b(\d{3})\b/)
  if (three) {
    const cardNo = Number(three[1])
    return { numberText: `${cardNo}`, cardNo, totalInSet: null }
  }

  return { numberText: null, cardNo: null, totalInSet: null }
}

function extractCardName(title, setAlias) {
  let t = stripNoise(title)

  if (setAlias) {
    t = t.replace(new RegExp(`\\b${escapeRegExp(setAlias)}\\b`, 'g'), ' ')
  }

  t = t.replace(/\b(sv\d+[a-z]?)\b/gi, ' ')
  t = t.replace(/\b(swsh\d+)\b/gi, ' ')
  t = t.replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, ' ')
  t = t.replace(/#\s*\d{1,3}\b/g, ' ')
  t = t.replace(/\b\d{3}\b/g, ' ')

  const head = t.split('-')[0].trim()
  const cleaned = head.replace(/\s+/g, ' ').trim()

  if (!cleaned) return null
  if (cleaned.length > 60) return null
  return cleaned
}

function parseAuctionTitle(title) {
  const titleNorm = normalize(title)
  const setCode = extractSetCode(titleNorm)
  const { setGuess, setAlias, confidence: setConfidence } = detectSet(title)
  const { numberText, cardNo, totalInSet } = extractNumberText(title)
  const cardName = extractCardName(title, setAlias)

  let enrichConfidence = 0
  if (cardName) enrichConfidence += 40
  if (numberText) enrichConfidence += 40
  if (setGuess) enrichConfidence += 20

  let status = 'unmatched'
  if (cardName && (numberText || setGuess)) status = enrichConfidence >= 70 ? 'linked' : 'needs_review'
  else if (cardName) status = 'needs_review'

  return {
    parsed_card_name: cardName,
    parsed_number_text: numberText,
    parsed_card_no: cardNo,
    parsed_total_in_set: totalInSet,
    parsed_set_guess: setGuess,
    parsed_set_confidence: setConfidence,
    setCode,
    enrich_status: status,
    enrich_confidence: enrichConfidence
  }
}

module.exports = { parseAuctionTitle }
