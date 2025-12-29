const assert = require('assert')
const { resolveAuctionMatch } = require('./numberFirstMatcher')

const fakeExpansions = [
  { id: 1, name: 'Base Set', set_code: 'BASE', era: 'Wizards of the Coast 1999-2003', language: 'EN', set_total: 102 },
  { id: 2, name: 'Gym Challenge', set_code: 'G2', era: 'Wizards of the Coast 1999-2003', language: 'EN', set_total: 132 },
  { id: 3, name: 'Gym Heroes', set_code: 'G1', era: 'Wizards of the Coast 1999-2003', language: 'EN', set_total: 132 },
  { id: 4, name: 'Jungle', set_code: 'JUNGLE', era: 'Wizards of the Coast 1999-2003', language: 'EN', set_total: 64 }
]

const fakeCards = [
  { id: 101, expansion_id: 1, card_number: '15/102', name: 'Venusaur' },
  { id: 201, expansion_id: 2, card_number: '57/132', name: "Misty's Tentacool" },
  { id: 301, expansion_id: 3, card_number: '13/132', name: 'Dark Vileplume' },
  { id: 401, expansion_id: 4, card_number: '14/64', name: 'Suicune' }
]

// minimal stub to satisfy the SQL queries used by numberFirstMatcher
const fakeDb = {
  async query(sql, params) {
    // auto-link queries:
    // SELECT id FROM public.cards WHERE expansion_id = $1 AND card_number = $2 LIMIT 2
    if (sql.includes('SELECT id FROM public.cards') && sql.includes('expansion_id = $1') && sql.includes('card_number = $2')) {
      const [expansionId, cardNumber] = params
      const rows = fakeCards
        .filter((c) => c.expansion_id === expansionId && c.card_number === cardNumber)
        .map((c) => ({ id: c.id }))
      return { rows }
    }

    // suggested cards queries (left join expansions)
    // ... WHERE c.expansion_id = ANY($1) AND c.card_number = $2
    if (sql.includes('FROM public.cards c') && sql.includes('expansion_id = ANY($1)')) {
      const [ids, cardNumber] = params
      const rows = fakeCards
        .filter((c) => ids.includes(c.expansion_id) && c.card_number === cardNumber)
        .map((c) => ({
          id: c.id,
          name: c.name,
          card_number: c.card_number,
          image_url: null,
          set_name: fakeExpansions.find((e) => e.id === c.expansion_id)?.name,
          set_code: fakeExpansions.find((e) => e.id === c.expansion_id)?.set_code
        }))
      return { rows }
    }

    // suggested cards queries for a specific guessed expansion:
    // ... WHERE c.expansion_id = $1 AND c.card_number = $2
    if (sql.includes('FROM public.cards c') && sql.includes('c.expansion_id = $1') && sql.includes('c.card_number = $2')) {
      const [expansionId, cardNumber] = params
      const rows = fakeCards
        .filter((c) => c.expansion_id === expansionId && c.card_number === cardNumber)
        .map((c) => ({
          id: c.id,
          name: c.name,
          card_number: c.card_number,
          image_url: null,
          set_name: fakeExpansions.find((e) => e.id === c.expansion_id)?.name,
          set_code: fakeExpansions.find((e) => e.id === c.expansion_id)?.set_code
        }))
      return { rows }
    }

    // suggested cards global fallback:
    // ... WHERE c.card_number = $1
    if (sql.includes('FROM public.cards c') && sql.includes('WHERE c.card_number = $1')) {
      const [cardNumber] = params
      const rows = fakeCards
        .filter((c) => c.card_number === cardNumber)
        .map((c) => ({
          id: c.id,
          name: c.name,
          card_number: c.card_number,
          image_url: null,
          set_name: fakeExpansions.find((e) => e.id === c.expansion_id)?.name,
          set_code: fakeExpansions.find((e) => e.id === c.expansion_id)?.set_code
        }))
      return { rows }
    }

    return { rows: [] }
  }
}

async function runHarness() {
  // matcher's normalizeEraLabel() treats any "wizards of the coast" as the key
  const era = ['Wizards of The Coast 1999-2003']

  // 1) Unique denominator => safe auto-link
  const direct = await resolveAuctionMatch(
    fakeDb,
    { title: 'Venusaur 015/102 Base Set', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(direct.parsed_card_number, '15/102')
  assert.strictEqual(direct.parsed_total_in_set, 102)
  assert.strictEqual(direct.card_id, 101)
  assert.strictEqual(direct.match_method, 'number_first')
  assert.strictEqual(direct.match_confidence, 'high')
  assert.strictEqual(direct.parsed_set_confidence, 'high')
  assert.strictEqual(direct.parsed_set_guess?.set_code, 'BASE')

  // 2) Collision denominator (132) => should NOT auto-link, but should produce candidates + maybe guess by hint
  const tied = await resolveAuctionMatch(
    fakeDb,
    { title: "Misty's Tentacool 57/132 Gym Challenge", attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(tied.parsed_card_number, '57/132')
  assert.strictEqual(tied.parsed_total_in_set, 132)
  assert.strictEqual(tied.card_id, null) // IMPORTANT: safe behavior
  assert.strictEqual(tied.match_method, 'unmatched')
  assert.ok((tied.parsed_set_candidates?.length ?? 0) >= 2)
  assert.strictEqual(tied.parsed_set_guess?.set_code, 'G2') // hint should pick Gym Challenge

  // 3) Collision denominator with no hint => no guess, still candidates
  const collisionNoHint = await resolveAuctionMatch(
    fakeDb,
    { title: 'Trainer 57/132', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(collisionNoHint.card_id, null)
  assert.strictEqual(collisionNoHint.match_method, 'unmatched')
  assert.strictEqual(collisionNoHint.parsed_set_guess, null)
  assert.ok((collisionNoHint.parsed_set_candidates?.length ?? 0) >= 2)

  // 4) Unknown denominator => unmatched
  const unmatched = await resolveAuctionMatch(
    fakeDb,
    { title: 'Unknown 99/999 Missing Set', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(unmatched.card_id, null)
  assert.strictEqual(unmatched.match_method, 'unmatched')
}

if (require.main === module) {
  runHarness()
    .then(() => {
      console.log('numberFirstMatcher tests passed')
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

module.exports = { runHarness }