const NOISE = [
  'pokemonkort',
  'pokemon kort',
  'pokémon kort',
  'pokémon',
  'pokemon',
  'kort',
  'nm',
  'near mint',
  'mint',
  'holo',
  'reverse holo',
  'ultra rare',
  'secret rare',
  'alt art',
  'svenska',
  'english',
  'japanese',
  'sword and shield',
  'sword & shield',
  'swsh'
]

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\p{L}\p{N}\/\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractNumber(normTitle) {
  const m = normTitle.match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  if (!m) return { numberText: null, cardNo: null, total: null }
  const cardNo = Number(m[1])
  const total = Number(m[2])
  if (Number.isNaN(cardNo) || Number.isNaN(total)) return { numberText: null, cardNo: null, total: null }
  return { numberText: `${m[1]}/${m[2]}`, cardNo, total }
}

function titleToCardNameGuess(normTitle, setAliasHit) {
  let working = normTitle
  if (setAliasHit) working = working.replaceAll(setAliasHit, ' ')
  for (const w of NOISE) working = working.replaceAll(normalize(w), ' ')
  working = working.replace(/\s+/g, ' ').trim()
  const tokens = working.split(' ').filter(Boolean)

  const guess = tokens.slice(0, Math.min(tokens.length, 4)).join(' ')
  return guess || null
}

module.exports = { normalize, extractNumber, titleToCardNameGuess }
