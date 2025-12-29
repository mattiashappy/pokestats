const ERA_ALLOWED_SETS = {
  'wizards of the coast 1999-2003': [
    'BASE',
    'JUNGLE',
    'FOSSIL',
    'BASE2',
    'TR',
    'G1',
    'G2',
    'N1',
    'N2',
    'N3',
    'N4',
    'LC',
    'EXP',
    'AQ',
    'SK'
  ],
  'wizards of the coast': [
    'BASE',
    'JUNGLE',
    'FOSSIL',
    'BASE2',
    'TR',
    'G1',
    'G2',
    'N1',
    'N2',
    'N3',
    'N4',
    'LC',
    'EXP',
    'AQ',
    'SK'
  ],
  'ex series 2003-2007': [],
  'diamond & pearl 2007-2009': [],
  'platinum 2009-2010': [],
  'heartgold soulsilver 2010-2011': [],
  'black & white 2011-2013': [],
  'xy 2013-2017': [],
  'sun & moon 2017-2019': [],
  'sword & shield 2020-2023': [],
  'scarlet & violet 2023-': []
}

const SET_KEYWORDS = [
  { key: 'gym heroes', canonical: 'gym heroes' },
  { key: 'gym challenge', canonical: 'gym challenge' },
  { key: 'jungle', canonical: 'jungle' },
  { key: 'fossil', canonical: 'fossil' },
  { key: 'team rocket', canonical: 'team rocket' },
  { key: 'rocket', canonical: 'team rocket' },
  { key: 'neo genesis', canonical: 'neo genesis' },
  { key: 'neo discovery', canonical: 'neo discovery' },
  { key: 'neo revelation', canonical: 'neo revelation' },
  { key: 'neo destiny', canonical: 'neo destiny' },
  { key: 'legendary collection', canonical: 'legendary collection' },
  { key: 'expedition', canonical: 'expedition' },
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
  if (!norm) return null
  if (norm.includes('wizards of the coast')) return 'wizards of the coast 1999-2003'
  return norm
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
  let cleaned = text
    .replace(/\b\d{1,3}\s*[\/-]\s*\d{1,3}\b/g, ' ')
    .replace(/pokemon/gi, ' ')
    .replace(/\|/g, ' ')

  for (const keyword of SET_KEYWORDS) {
    cleaned = cleaned.replace(new RegExp(keyword.key, 'ig'), ' ')
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned
}

function allowedSetCodesForEra(eraLabel) {
  const norm = normalizeEraLabel(eraLabel)
  if (!norm) return null
  const allowed = ERA_ALLOWED_SETS[norm]
  if (allowed && allowed.length) return allowed
  return null
}

function pickCandidateExpansions(expansions, { era, language, total }) {
  const allowedCodes = allowedSetCodesForEra(era)
  const eraFiltered = Array.isArray(allowedCodes) ? expansions.filter((exp) => allowedCodes.includes(exp.set_code)) : expansions
  const languageNorm = normalizeLanguage(language)
  const languageFiltered = languageNorm
    ? eraFiltered.filter((exp) => normalizeLanguage(exp.language) === languageNorm)
    : eraFiltered
  if (total == null) return languageFiltered
  return languageFiltered.filter((exp) => exp.set_total === total)
}

function matchSetHint(candidates, { setHint, text }) {
  const textNorm = normalizeText(text || '')
  const setNorm = setHint ? normalizeText(setHint) : null

  const hinted = candidates.filter((exp) => {
    const nameNorm = normalizeText(exp.name)
    const codeNorm = normalizeText(exp.set_code)
    if (setNorm) return nameNorm.includes(setNorm) || codeNorm.includes(setNorm)
    return textNorm.includes(nameNorm) || textNorm.includes(codeNorm)
  })

  if (hinted.length === 1) return { guess: hinted[0], confidence: 'high' }
  if (hinted.length > 1) return { guess: null, confidence: 'medium' }
  return { guess: null, confidence: null }
}

async function fetchSuggestedCards(db, { candidates, cardNumber, guessedExpansionId }) {
  if (!cardNumber) return []
  const candidateIds = candidates.map((c) => c.id)

  const params = []
  const clauses = []

  if (guessedExpansionId) {
    clauses.push('c.expansion_id = $1')
    params.push(guessedExpansionId)
  } else if (candidateIds.length) {
    clauses.push('c.expansion_id = ANY($1)')
    params.push(candidateIds)
  }

  const sqlBase = `
    SELECT c.id, c.name, c.card_number, c.image_url, e.name AS set_name, COALESCE(e.set_code, c.set_code) AS set_code
    FROM public.cards c
    LEFT JOIN public.expansions e ON e.id = c.expansion_id
  `

  if (!clauses.length) {
    const { rows } = await db.query(`${sqlBase} WHERE c.card_number = $1 LIMIT 25`, [cardNumber])
    return rows
  }

  const { rows } = await db.query(`${sqlBase} WHERE ${clauses.join(' AND ')} AND c.card_number = $${params.length + 1} LIMIT 25`, [
    ...params,
    cardNumber
  ])
  return rows
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
    parsed_total_in_set: denominator || null,
    parsed_set_hint: setHint,
    parsed_set_guess: null,
    parsed_set_confidence: null,
    parsed_set_candidates: [],
    suggested_cards: [],
    enrich_notes: null,
    match_method: 'unmatched',
    match_confidence: null,
    card_id: null
  }

  const candidates = pickCandidateExpansions(expansions, { era, language, total: denominator })
  const parsed_set_candidates = candidates.map((exp) => ({
    expansion_id: exp.id,
    set_code: exp.set_code,
    name: exp.name,
    set_total: exp.set_total
  }))

  let parsed_set_guess = null
  let parsed_set_confidence = null

  if (denominator && candidates.length === 1) {
    parsed_set_guess = {
      expansion_id: candidates[0].id,
      set_code: candidates[0].set_code,
      name: candidates[0].name
    }
    parsed_set_confidence = 'high'
  } else if (candidates.length > 1) {
    const hinted = matchSetHint(candidates, { setHint, text })
    if (hinted.guess) {
      parsed_set_guess = {
        expansion_id: hinted.guess.id,
        set_code: hinted.guess.set_code,
        name: hinted.guess.name
      }
      parsed_set_confidence = hinted.confidence || 'high'
    } else {
      parsed_set_confidence = 'medium'
    }
  } else if (candidates.length === 0 && denominator) {
    parsed_set_confidence = 'low'
  }

  const guessedExpansionId = parsed_set_guess?.expansion_id || null
  const suggested_cards = await fetchSuggestedCards(db, { candidates, cardNumber, guessedExpansionId })

  let card_id = null
  let match_method = 'unmatched'
  let match_confidence = null

  if (cardNumber && candidates.length === 1) {
    const { rows } = await db.query(
      `SELECT id FROM public.cards WHERE expansion_id = $1 AND card_number = $2 LIMIT 2`,
      [candidates[0].id, cardNumber]
    )
    if (rows.length === 1) {
      card_id = rows[0].id
      match_method = 'number_first'
      match_confidence = 'high'
    }
  }

  if (!card_id && cardNumber && guessedExpansionId) {
    const { rows } = await db.query(
      `SELECT id FROM public.cards WHERE expansion_id = $1 AND card_number = $2 LIMIT 2`,
      [guessedExpansionId, cardNumber]
    )
    if (rows.length === 1) {
      card_id = rows[0].id
      match_method = 'number_first_tiebreak'
      match_confidence = parsed_set_confidence || 'medium'
    }
  }

  const enrich_notes = !card_id && cardNumber && candidates.length === 0 ? { reason: 'no_set_match' } : null

  return {
    ...baseUpdate,
    parsed_set_candidates,
    parsed_set_guess,
    parsed_set_confidence,
    suggested_cards,
    match_method,
    match_confidence,
    card_id,
    enrich_notes
  }
}

module.exports = {
  normalizeEraLabel,
  normalizeLanguage,
  parseCardNumber,
  parseSetHint,
  parseCardName,
  resolveAuctionMatch
}
