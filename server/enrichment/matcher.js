const { loadCatalog } = require('../catalog/catalogLoader')

function determinePrintedSetTotal(cardsEntry, fallback = null) {
  let printedTotal = cardsEntry?.set_total ?? null

  for (const card of cardsEntry?.cards || []) {
    const match = String(card.card_number || '').match(/\b\d{1,3}\s*\/(\d{1,3})\b/)
    const denom = match ? parseInt(match[1], 10) : null

    if (Number.isFinite(denom)) {
      printedTotal = printedTotal == null ? denom : Math.max(printedTotal, denom)
    }
  }

  return printedTotal ?? fallback ?? null
}

function normalizeText(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCardNumberFromTitle(title) {
  const match = (title || '').match(/\b(\d{1,3})\s*\/(\d{1,3})\b/)
  if (!match) return { cardNumber: null, setTotal: null }

  const cardNo = parseInt(match[1], 10)
  const setTotal = parseInt(match[2], 10)

  if (!Number.isFinite(cardNo) || !Number.isFinite(setTotal)) return { cardNumber: null, setTotal: null }

  return { cardNumber: cardNo, setTotal }
}

function buildSetIndexes(expansions, cardsBySetCode) {
  const setsByEraAndTotal = {}
  const setHintIndex = new Map()
  const cardsBySetAndNumber = {}

  const addHint = (hint, setCode) => {
    const norm = normalizeText(hint)
    if (!norm) return
    if (!setHintIndex.has(norm)) setHintIndex.set(norm, new Set())
    setHintIndex.get(norm).add(setCode)
  }

  for (const expansion of expansions || []) {
    const eraKey = normalizeText(expansion.era)
    const cardsEntry = cardsBySetCode?.[expansion.set_code] || null
    const setTotal = determinePrintedSetTotal(cardsEntry, expansion.set_total)
    if (!eraKey) continue

    if (!setsByEraAndTotal[eraKey]) setsByEraAndTotal[eraKey] = {}
    if (!setsByEraAndTotal[eraKey][setTotal]) setsByEraAndTotal[eraKey][setTotal] = []
    setsByEraAndTotal[eraKey][setTotal].push({
      set_code: expansion.set_code,
      name: expansion.name || expansion.set_code,
      era: expansion.era || null,
      set_total: setTotal || null
    })

    addHint(expansion.name, expansion.set_code)
    addHint(expansion.set_code, expansion.set_code)

    const aliases = expansion.aliases || []
    if (Array.isArray(aliases)) {
      for (const alias of aliases) addHint(alias, expansion.set_code)
    }
  }

  for (const [setCode, cards] of Object.entries(cardsBySetCode || {})) {
    const numbers = {}
    for (const card of cards.cards || []) {
      const numeric = parseInt(String(card.card_number).split(/[\s/]/)[0], 10)
      if (!Number.isFinite(numeric)) continue
      numbers[numeric] = card
    }
    cardsBySetAndNumber[setCode] = numbers
  }

  return { setsByEraAndTotal, setHintIndex, cardsBySetAndNumber }
}

function chooseSetCandidate(candidates, title, setHintIndex) {
  if (!candidates?.length) return { set: null, reason: 'no_candidates' }
  if (candidates.length === 1) return { set: candidates[0], reason: 'unique_total' }

  const titleNorm = normalizeText(title)
  let hintedSet = null

  for (const [hint, codes] of setHintIndex.entries()) {
    if (!titleNorm.includes(hint)) continue
    const overlap = candidates.filter((c) => codes.has(c.set_code))
    if (overlap.length === 1) {
      hintedSet = overlap[0]
      break
    }
  }

  if (hintedSet) return { set: hintedSet, reason: 'set_hint' }
  return { set: null, reason: 'ambiguous' }
}

function resolveEraKey(rawEra, setsByEraAndTotal) {
  const normalized = normalizeText(rawEra)
  if (normalized && setsByEraAndTotal[normalized]) {
    return { key: normalized, resolution: 'exact' }
  }

  const stripped = normalized?.replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (stripped && setsByEraAndTotal[stripped]) {
    return { key: stripped, resolution: 'stripped_numbers' }
  }

  for (const candidateKey of Object.keys(setsByEraAndTotal || {})) {
    if (normalized && normalized.includes(candidateKey)) {
      return { key: candidateKey, resolution: 'contains_candidate' }
    }
    if (normalized && candidateKey.includes(normalized)) {
      return { key: candidateKey, resolution: 'contained_in_candidate' }
    }
  }

  return { key: null, resolution: 'unresolved' }
}

function matchAuction(auctionRow, indexes) {
  const { setsByEraAndTotal, setHintIndex, cardsBySetAndNumber } = indexes

  const rawEra = auctionRow?.era || auctionRow?.pokemon_era || auctionRow?.attributes?.pokemon_era?.[0]
  const { key: eraKey, resolution: eraResolution } = resolveEraKey(rawEra, setsByEraAndTotal)

  if (!eraKey || !setsByEraAndTotal[eraKey]) {
    return {
      match_status: 'Mismatched',
      matched_era: rawEra || null,
      parsed_card_number: null,
      parsed_set_total: null,
      matched_set_code: null,
      matched_card_number: null,
      matched_card_id: null,
      candidate_sets: [],
      debug: { reason: 'missing_or_invalid_era', era_resolution: eraResolution }
    }
  }

  const { cardNumber, setTotal } = parseCardNumberFromTitle(auctionRow?.title)
  const candidateSets = setTotal != null ? setsByEraAndTotal[eraKey]?.[setTotal] || [] : []

  if (!cardNumber || !setTotal) {
    return {
      match_status: 'Needs review',
      matched_era: rawEra || null,
      parsed_card_number: cardNumber || null,
      parsed_set_total: setTotal || null,
      matched_set_code: null,
      matched_card_number: null,
      matched_card_id: null,
      candidate_sets: candidateSets,
      debug: { reason: 'missing_card_number', candidates: candidateSets, era_resolution: eraResolution }
    }
  }

  const { set: chosenSet, reason } = chooseSetCandidate(candidateSets, auctionRow?.title || '', setHintIndex)

  if (!chosenSet) {
    return {
      match_status: 'Needs review',
      matched_era: rawEra || null,
      parsed_card_number: cardNumber,
      parsed_set_total: setTotal,
      matched_set_code: null,
      matched_card_number: null,
      matched_card_id: null,
      candidate_sets: candidateSets,
      debug: { reason, candidates: candidateSets, era_resolution: eraResolution }
    }
  }

  const card = cardsBySetAndNumber?.[chosenSet.set_code]?.[cardNumber] || null
  const matched = {
    match_status: null,
    matched_era: rawEra || null,
    parsed_card_number: cardNumber,
    parsed_set_total: setTotal,
    matched_set_code: chosenSet.set_code,
    matched_card_number: cardNumber,
    matched_card_id: null,
    candidate_sets: candidateSets,
    debug: { reason, candidates: candidateSets, era_resolution: eraResolution }
  }

  if (card) {
    matched.matched_card_id = card.id ?? null
    if (reason === 'set_hint') matched.match_status = 'Matched (High)'
    else if (reason === 'unique_total') matched.match_status = 'Matched (Medium)'
    else matched.match_status = 'Matched (Low)'
  } else {
    matched.match_status = 'Needs review'
  }

  return matched
}

async function loadMatcherIndexes() {
  const { expansions, cardsBySetCode } = await loadCatalog()
  return buildSetIndexes(expansions, cardsBySetCode)
}

module.exports = {
  normalizeText,
  parseCardNumberFromTitle,
  buildSetIndexes,
  chooseSetCandidate,
  resolveEraKey,
  matchAuction,
  loadMatcherIndexes
}
