const SET_ALIASES = [
  { set: 'Fusion Strike', aliases: ['fusion strike', 'fs', 'swsh08'] },
  { set: 'Base Set', aliases: ['base set', 'baseset'] },
  { set: 'Jungle', aliases: ['jungle'] },
  { set: 'Gym Heroes', aliases: ['gym heroes'] },
  { set: 'Paldea Evolved', aliases: ['paldea evolved'] }
]

const STOPWORDS = [
  'pokemonkort',
  'pokémonkort',
  'pokemon kort',
  'pokémon kort',
  'ultra rare',
  'rare',
  'holo',
  'reverse',
  'vintage',
  'nintendo',
  'original',
  'samfrakt',
  'first edition',
  'edition'
]

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

function detectSet(title) {
  const t = normalize(title)
  for (const entry of SET_ALIASES) {
    for (const a of entry.aliases) {
      if (t.includes(a)) return { setGuess: entry.set, confidence: 80 }
    }
  }
  return { setGuess: null, confidence: 0 }
}

function extractNumberText(title) {
  const t = normalize(title)

  const frac = t.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (frac) {
    const cardNo = Number(frac[1])
    const total = Number(frac[2])
    return { numberText: `${cardNo}/${total}`, cardNo, totalInSet: total }
  }

  const hash = t.match(/#\s*(\d{1,3})\b/)
  if (hash) {
    const cardNo = Number(hash[1])
    return { numberText: `#${cardNo}`, cardNo, totalInSet: null }
  }

  const three = t.match(/\b(\d{3})\b/)
  if (three) {
    const cardNo = Number(three[1])
    return { numberText: `${cardNo}`, cardNo, totalInSet: null }
  }

  return { numberText: null, cardNo: null, totalInSet: null }
}

function extractCardName(title) {
  let t = stripNoise(title)

  t = t.replace(/\b(sv\d+[a-z]?)\b/g, ' ')
  t = t.replace(/\b(swsh\d+)\b/g, ' ')
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
  const { setGuess, confidence: setConfidence } = detectSet(title)
  const { numberText, cardNo, totalInSet } = extractNumberText(title)
  const cardName = extractCardName(title)

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
    enrich_status: status,
    enrich_confidence: enrichConfidence
  }
}

module.exports = { parseAuctionTitle }
