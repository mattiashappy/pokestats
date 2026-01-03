const { loadCatalog } = require('../catalog/catalogLoader')

function normalize(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCardNumber(text) {
  const normalized = text || ''
  const fractionMatch = normalized.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/)
  if (fractionMatch) {
    const cardNumber = Number.parseInt(fractionMatch[1], 10)
    const denominator = Number.parseInt(fractionMatch[2], 10)
    return { cardNumber: Number.isFinite(cardNumber) ? cardNumber : null, denominator: Number.isFinite(denominator) ? denominator : null }
  }

  const standaloneMatch = normalized.match(/\b(\d{1,3})(?:[a-zA-Z])?\b/)
  if (standaloneMatch) {
    const cardNumber = Number.parseInt(standaloneMatch[1], 10)
    return { cardNumber: Number.isFinite(cardNumber) ? cardNumber : null, denominator: null }
  }

  return { cardNumber: null, denominator: null }
}

function parseSetHint(text) {
  const words = (text || '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  const candidate = words.find((word) => word.length >= 2 && word.length <= 6 && /[A-Za-z]/.test(word))
  return candidate ? candidate.toUpperCase() : null
}

function parseCardName(text) {
  if (!text) return null

  const withoutNumbers = text
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/, ' ')
    .replace(/\b\d{1,3}[A-Za-z]?\b/, ' ')

  const cleaned = normalize(withoutNumbers)
  if (!cleaned) return null

  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function resolveAuctionMatch(_client, row, expansions = null) {
  const text = `${row?.title || ''} ${row?.description || ''}`
  const { cardNumber, denominator } = parseCardNumber(text)
  const setHint = parseSetHint(text)
  const eraHint = row?.era || row?.pokemon_era || row?.attributes?.pokemon_era?.[0] || null

  let catalog = expansions
  if (!catalog) {
    const { expansions: loadedExpansions } = await loadCatalog()
    catalog = loadedExpansions || []
  }

  const normalizedHint = normalize(setHint)
  const normalizedEra = normalize(eraHint)

  const setCandidates = (catalog || []).filter((expansion) => {
    const code = normalize(expansion.set_code)
    const name = normalize(expansion.name)
    const era = normalize(expansion.era)

    const hintMatches = normalizedHint ? code.includes(normalizedHint) || name.includes(normalizedHint) : true
    const eraMatches = normalizedEra ? era.includes(normalizedEra) : true
    const totalMatches = denominator && expansion.set_total ? expansion.set_total === denominator : true

    return hintMatches && eraMatches && totalMatches
  })

  const chosenSet = setCandidates.length === 1 ? setCandidates[0] : null

  return {
    parsed_name: parseCardName(text),
    parsed_card_number: cardNumber,
    parsed_total_in_set: denominator,
    parsed_set_hint: setHint,
    parsed_set_guess: chosenSet?.set_code ?? null,
    parsed_set_confidence: chosenSet ? 'medium' : null,
    parsed_set_candidates: setCandidates,
    suggested_cards: [],
    enrich_notes: null,
    match_method: chosenSet ? 'number_first' : 'unmatched',
    match_confidence: chosenSet ? 'low' : 'low',
    card_id: null,
    collision_candidates: []
  }
}

module.exports = {
  resolveAuctionMatch,
  parseCardNumber,
  parseSetHint,
  parseCardName
}
