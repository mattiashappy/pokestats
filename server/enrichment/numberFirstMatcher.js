const { loadCatalog } = require('../catalog/catalogLoader')

function normalize(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
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
    return {
      cardNumber: Number.isFinite(cardNumber) ? cardNumber : null,
      denominator: Number.isFinite(denominator) ? denominator : null,
      rawText: fractionMatch[0]
    }
  }

  const standaloneMatch = normalized.match(/\b(\d{1,3})(?:[a-zA-Z])?\b/)
  if (standaloneMatch) {
    const cardNumber = Number.parseInt(standaloneMatch[1], 10)
    return { cardNumber: Number.isFinite(cardNumber) ? cardNumber : null, denominator: null, rawText: standaloneMatch[0] }
  }

  return { cardNumber: null, denominator: null, rawText: null }
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

function determinePrintedSetTotal(cardsEntry, fallback = null) {
  let printedTotal = fallback ?? cardsEntry?.set_total ?? null

  for (const card of cardsEntry?.cards || []) {
    const match = String(card.card_number || '').match(/\b\d{1,3}\s*\/(\d{1,3})\b/)
    const denom = match ? parseInt(match[1], 10) : null

    if (Number.isFinite(denom)) {
      printedTotal = printedTotal == null ? denom : Math.max(printedTotal, denom)
    }
  }

  return printedTotal ?? null
}

function collectSetHints(row, text) {
  const hints = []
  const normalizedText = normalize(text)

  const fields = [
    row?.set_code,
    row?.set_name,
    row?.attributes?.set_name?.[0],
    row?.attributes?.set_code?.[0],
    row?.attributes?.expansion?.[0]
  ]

  for (const field of fields) {
    const normalized = normalize(field)
    if (normalized) hints.push(normalized)
  }

  const freeformHint = normalize(parseSetHint(text))
  if (freeformHint) hints.push(freeformHint)

  if (normalizedText) hints.push(normalizedText)

  return hints.filter(Boolean)
}

function findSetCandidates({
  catalog,
  cardsBySet,
  setHints,
  setTotalHint,
  cardNumber,
  eraHint,
  normalizedText
}) {
  const eraNormalized = normalize(eraHint)

  const candidates = []

  for (const expansion of catalog || []) {
    const normalizedCode = normalize(expansion.set_code)
    const normalizedName = normalize(expansion.name)
    const normalizedEra = normalize(expansion.era)
    const codeMentioned = normalizedText && normalizedCode && normalizedText.includes(normalizedCode)
    const nameMentioned = normalizedText && normalizedName && normalizedText.includes(normalizedName)

    const cardsEntry = cardsBySet?.[expansion.set_code] || null
    const printedTotal = determinePrintedSetTotal(
      cardsEntry,
      expansion.set_number ?? expansion.set_total
    )

    const hasCardNumber = Number.isFinite(cardNumber)
      ? (cardsEntry?.cards || []).some((card) => {
          const numeric = Number.parseInt(String(card.card_number || '').split(/\s*\/|\s+/)[0], 10)
          return Number.isFinite(numeric) && numeric === cardNumber
        })
      : false

    if (Number.isFinite(cardNumber) && Number.isFinite(printedTotal) && cardNumber > printedTotal && !hasCardNumber) {
      continue
    }

    const hintScore = setHints.some(
      (hint) => (hint && normalizedCode && normalizedCode.includes(hint)) || (hint && normalizedName && normalizedName.includes(hint))
    )
      ? 2
      : 0

    const totalScore = setTotalHint && printedTotal === setTotalHint ? 1 : 0
    const eraScore = eraNormalized && normalizedEra && normalizedEra.includes(eraNormalized) ? 1 : 0
    const textScore = codeMentioned || nameMentioned ? 2 : 0

    const score = hintScore + totalScore + eraScore + textScore

    if (score === 0 && !setTotalHint) continue

    candidates.push({
      expansion,
      printedTotal,
      score,
      reasons: {
        hint: hintScore > 0,
        total: totalScore > 0,
        era: eraScore > 0,
        hasCardNumber
      }
    })
  }

  const maxScore = Math.max(...candidates.map((c) => c.score), 0)
  const bestCandidates = candidates.filter((candidate) => candidate.score === maxScore && maxScore > 0)

  if (bestCandidates.length === 1) {
    return { chosen: bestCandidates[0], candidates }
  }

  return { chosen: null, candidates: bestCandidates.length ? bestCandidates : candidates }
}

async function resolveAuctionMatch(_client, row, expansions = null, cardsBySetCode = null) {
  const text = `${row?.title || ''} ${row?.description || ''}`
  const { cardNumber, denominator, rawText } = parseCardNumber(text)
  const eraHint = row?.era || row?.pokemon_era || row?.attributes?.pokemon_era?.[0] || null

  let catalog = expansions
  let cardsBySet = cardsBySetCode
  if (!catalog || !cardsBySet) {
    const { expansions: loadedExpansions, cardsBySetCode: loadedCards } = await loadCatalog()
    catalog = catalog || loadedExpansions || []
    cardsBySet = cardsBySet || loadedCards || {}
  }

  const normalizedText = normalize(text)
  const setHints = collectSetHints(row, text)
  const { chosen, candidates } = findSetCandidates({
    catalog,
    cardsBySet,
    setHints,
    setTotalHint: denominator,
    cardNumber,
    eraHint,
    normalizedText
  })

  const chosenSet = chosen?.expansion || null
  const cardsEntry = chosenSet ? cardsBySet?.[chosenSet.set_code] || null : null
  const parsedName = parseCardName(text)

  let matchedCard = null
  let nameMatched = false

  if (chosenSet && Number.isFinite(cardNumber)) {
    matchedCard = (cardsEntry?.cards || []).find((card) => {
      const numeric = Number.parseInt(String(card.card_number || '').split(/[\s/]/)[0], 10)
      if (!Number.isFinite(numeric) || numeric !== cardNumber) return false

      const normalizedName = normalize(card.name)
      nameMatched = normalizedName && normalizedText.includes(normalizedName)
      return true
    })
  }

  const matchConfidence = matchedCard ? (nameMatched ? 'high' : 'medium') : chosenSet ? 'low' : 'low'
  const setConfidence = chosenSet
    ? chosen?.score >= 3
      ? 'high'
      : 'medium'
    : candidates?.length
      ? 'low'
      : null

  const enrichNotes = !chosenSet
    ? 'Unable to determine set confidently'
    : chosen && chosen.reasons.total === false && denominator
      ? `Set inferred without matching denominator (${denominator})`
      : null

  return {
    parsed_name: parsedName,
    parsed_card_no: cardNumber,
    parsed_card_number: cardNumber,
    parsed_number_text: rawText,
    parsed_total_in_set: denominator,
    parsed_set_hint: setHints.find(Boolean) || null,
    parsed_set_guess: chosenSet?.set_code ?? null,
    parsed_set_confidence: setConfidence,
    parsed_set_candidates: candidates.map((candidate) => ({
      set_code: candidate.expansion.set_code,
      name: candidate.expansion.name,
      score: candidate.score,
      reasons: candidate.reasons,
      printed_total: candidate.printedTotal
    })),
    suggested_cards: matchedCard ? [matchedCard] : [],
    enrich_notes: enrichNotes,
    match_method: chosenSet ? 'number_first_set_first' : 'unmatched',
    match_confidence: matchConfidence,
    card_id: matchedCard?.id ?? null,
    collision_candidates: [],
    matched_set_code: chosenSet?.set_code ?? null,
    matched_card_number: matchedCard ? cardNumber : null,
    set_inference_reason: chosenSet ? 'resolved' : candidates.length > 1 ? 'ambiguous' : 'none'
  }
}

module.exports = {
  resolveAuctionMatch
}
