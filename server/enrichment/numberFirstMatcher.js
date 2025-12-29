const ERA_ALIASES = new Map([
  ['wizards of the coast 1999-2003', 'wizards of the coast'],
  ['wizards of the coast 1999 2003', 'wizards of the coast'],
])

const SET_KEYWORDS = [
  { key: 'base set', canonical: 'base set' },
  { key: 'base', canonical: 'base set' },
  { key: 'base2', canonical: 'base set 2' },
  { key: 'base set 2', canonical: 'base set 2' },
  { key: 'jungle', canonical: 'jungle' },
  { key: 'fossil', canonical: 'fossil' },
  { key: 'team rocket', canonical: 'team rocket' },
  { key: 'rocket', canonical: 'team rocket' },
  { key: 'gym heroes', canonical: 'gym heroes' },
  { key: 'gym challenge', canonical: 'gym challenge' },
  { key: 'neo genesis', canonical: 'neo genesis' },
  { key: 'neo gen', canonical: 'neo genesis' },
  { key: 'neo discovery', canonical: 'neo discovery' },
  { key: 'neo revelation', canonical: 'neo revelation' },
  { key: 'neo destiny', canonical: 'neo destiny' },
  { key: 'legendary collection', canonical: 'legendary collection' },
  { key: 'expedition', canonical: 'expedition base set' },
  { key: 'aquapolis', canonical: 'aquapolis' },
  { key: 'skyridge', canonical: 'skyridge' }
]

function normalizeText(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeEraLabel(label) {
  if (!label) return null
  const norm = normalizeText(label)
  if (ERA_ALIASES.has(norm)) return ERA_ALIASES.get(norm)
  if (norm.includes('wizards of the coast')) return 'wizards of the coast'
  return norm || null
}

function normalizeLanguage(value) {
  if (!value) return null
  return normalizeText(value)
}

function parseCardNumber(text) {
  const norm = text || ''
  const match = norm.match(/\b(\d{1,3})\s*[\/\-]\s*(\d{1,3})\b/)
  if (!match) return { cardNumber: null, numerator: null, denominator: null }
  const numerator = parseInt(match[1], 10)
  const denominator = parseInt(match[2], 10)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return { cardNumber: null, numerator: null, denominator: null }
  }
  return { cardNumber: `${numerator}/${denominator}`, numerator, denominator }
}

function parseSetHint(text) {
  const norm = normalizeText(text)
  for (const entry of SET_KEYWORDS) {
    if (norm.includes(entry.key)) return entry.canonical
  }
  return null
}

function parseCardName(text) {
  if (!text) return null
  let cleaned = text.replace(/\b\d{1,3}\s*[\/-]\s*\d{1,3}\b/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned
}

function pickExpansionFromTotal(
  expansions,
  eraHint,
  total,
  { setHint = null, languageHint = null, textHint = null } = {}
) {
  const eraNorm = normalizeEraLabel(eraHint)
  const setNorm = setHint ? normalizeText(setHint) : null
  const languageNorm = normalizeLanguage(languageHint)
  const textNorm = normalizeText(textHint || '')

  const byEra = eraNorm
    ? expansions.filter((exp) => normalizeEraLabel(exp.era) === eraNorm)
    : expansions
  const byLanguage = languageNorm
    ? byEra.filter((exp) => normalizeLanguage(exp.language) === languageNorm)
    : byEra
  const byTotal = byLanguage.filter((exp) => total != null && exp.set_total === total)

  if (byTotal.length === 1) {
    return { expansion: byTotal[0], confidence: 'high', reason: 'total' }
  }

  const hinted = byTotal.filter((exp) => {
    const nameNorm = normalizeText(exp.name)
    const codeNorm = normalizeText(exp.set_code)
    if (setNorm) return nameNorm.includes(setNorm) || codeNorm.includes(setNorm)
    return textNorm.includes(nameNorm) || textNorm.includes(codeNorm)
  })

  if (hinted.length === 1) return { expansion: hinted[0], confidence: 'medium', reason: 'total+hint' }
  if (hinted.length > 1) return { expansion: null, collision: hinted, reason: 'collision' }

  if (byTotal.length > 0) {
    return { expansion: null, collision: byTotal, reason: 'collision' }
  }

  return { expansion: null, collision: [], reason: 'none' }
}

async function resolveAuctionMatch(db, auction, expansions) {
  const text = `${auction.title || ''} ${auction.description || ''}`
  const { cardNumber, numerator, denominator } = parseCardNumber(text)
  const setHint = parseSetHint(text)
  const parsedName = parseCardName(text)
  const era = auction?.attributes?.pokemon_era?.[0] || auction?.pokemon_era || auction?.era || null
  const language =
    auction?.language ||
    auction?.pokemon_language ||
    auction?.attributes?.pokemon_language ||
    auction?.attributes?.Language ||
    null

  const baseUpdate = {
    parsed_name: parsedName || null,
    parsed_card_number: cardNumber,
    parsed_set_hint: setHint,
    match_method: 'unmatched',
    match_confidence: null,
    card_id: null,
    collision_candidates: []
  }

  if (!cardNumber) return baseUpdate

  const expansionPick = pickExpansionFromTotal(expansions, era, denominator, {
    setHint,
    languageHint: language,
    textHint: text
  })
  const candidateExpansions = expansionPick.collision || []
  let chosenExpansion = expansionPick.expansion
  let matchConfidence = expansionPick.confidence || null
  let matchMethod = expansionPick.reason === 'total+hint' ? 'number_first_tiebreak' : 'number_first'

  if (!chosenExpansion && candidateExpansions.length > 0) {
    const ids = candidateExpansions.map((exp) => exp.id)
    const { rows } = await db.query(
      `
        SELECT id, expansion_id
        FROM public.cards
        WHERE expansion_id = ANY($1)
          AND card_number = $2
        LIMIT 5
      `,
      [ids, cardNumber]
    )

    if (rows.length === 1) {
      chosenExpansion = candidateExpansions.find((exp) => exp.id === rows[0].expansion_id) || null
      matchConfidence = 'medium'
      matchMethod = 'number_first_tiebreak'
    } else if (rows.length > 1 && parsedName) {
      const nameRows = await db.query(
        `
          SELECT id, expansion_id
          FROM public.cards
          WHERE expansion_id = ANY($1)
            AND name ILIKE $2
          LIMIT 1
        `,
        [ids, `%${parsedName}%`]
      )
      if (nameRows.rows[0]) {
        chosenExpansion =
          candidateExpansions.find((exp) => exp.id === nameRows.rows[0].expansion_id) || null
        matchConfidence = 'low'
        matchMethod = 'number_first_tiebreak'
      }
    }
  }

  if (!chosenExpansion)
    return {
      ...baseUpdate,
      match_method: 'unmatched',
      collision_candidates: candidateExpansions
    }

  const { rows } = await db.query(
    `SELECT id FROM public.cards WHERE expansion_id = $1 AND card_number = $2 LIMIT 1`,
    [chosenExpansion.id, cardNumber]
  )

  if (!rows[0]) {
    if (parsedName) {
      const fallback = await db.query(
        `SELECT id FROM public.cards WHERE expansion_id = $1 AND name ILIKE $2 LIMIT 1`,
        [chosenExpansion.id, `%${parsedName}%`]
      )
      if (fallback.rows[0]) {
        return {
          ...baseUpdate,
          card_id: fallback.rows[0].id,
          match_method: matchMethod === 'number_first' ? 'number_first_tiebreak' : matchMethod,
          match_confidence: 'low'
        }
      }
    }

    return {
      ...baseUpdate,
      match_method: 'unmatched',
      collision_candidates: candidateExpansions
    }
  }

  return {
    ...baseUpdate,
    card_id: rows[0].id,
    match_method: matchMethod,
    match_confidence: matchConfidence || 'high'
  }
}

module.exports = {
  normalizeEraLabel,
  normalizeLanguage,
  parseCardNumber,
  parseSetHint,
  parseCardName,
  pickExpansionFromTotal,
  resolveAuctionMatch
}
