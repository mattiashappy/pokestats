const assert = require('assert')
const { resolveAuctionMatch } = require('./numberFirstMatcher')

const fakeExpansions = [
  { id: 1, name: 'Base Set', set_code: 'BASE', era: 'Wizards of the Coast 1999-2003', set_total: 102 },
  { id: 2, name: 'Gym Challenge', set_code: 'G2', era: 'Wizards of the Coast 1999-2003', set_total: 132 },
  { id: 3, name: 'Gym Heroes', set_code: 'G1', era: 'Wizards of the Coast 1999-2003', set_total: 132 },
  { id: 4, name: 'Jungle', set_code: 'JUNGLE', era: 'Wizards of the Coast 1999-2003', set_total: 64 }
]

const fakeCards = [
  { id: 101, expansion_id: 1, card_number: '15/102', name: 'Venusaur' },
  { id: 201, expansion_id: 2, card_number: '57/132', name: "Misty's Tentacool" },
  { id: 301, expansion_id: 3, card_number: '13/132', name: 'Dark Vileplume' },
  { id: 401, expansion_id: 4, card_number: '14/64', name: 'Suicune' }
]

const fakeDb = {
  async query(sql, params) {
    if (sql.includes('FROM public.cards') && sql.includes('expansion_id = ANY')) {
      const [ids, cardNumber] = params
      const rows = fakeCards
        .filter((card) => ids.includes(card.expansion_id) && card.card_number === cardNumber)
        .map((card) => ({ id: card.id, expansion_id: card.expansion_id }))
      return { rows }
    }

    if (sql.includes('FROM public.cards') && sql.includes('expansion_id = $1')) {
      const [expansionId, cardNumber] = params
      const rows = fakeCards
        .filter((card) => card.expansion_id === expansionId && card.card_number === cardNumber)
        .map((card) => ({ id: card.id }))
      return { rows }
    }

    if (sql.includes('SELECT c.id')) {
      const [expansionId, cardNumber] = params.length === 2 ? params : [null, params[params.length - 1]]
      const rows = fakeCards
        .filter((card) => (expansionId ? card.expansion_id === expansionId : true) && card.card_number === cardNumber)
        .map((card) => ({
          id: card.id,
          name: card.name,
          card_number: card.card_number,
          image_url: null,
          set_name: fakeExpansions.find((e) => e.id === card.expansion_id)?.name,
          set_code: fakeExpansions.find((e) => e.id === card.expansion_id)?.set_code
        }))
      return { rows }
    }

    return { rows: [] }
  }
}

async function runHarness() {
  const era = ['Wizards of The Coast 1999-2003']

  const direct = await resolveAuctionMatch(
    fakeDb,
    { title: 'Venusaur 015/102 Base Set', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(direct.card_id, 101)
  assert.strictEqual(direct.match_method, 'number_first')
  assert.strictEqual(direct.match_confidence, 'high')
  assert.strictEqual(direct.parsed_set_confidence, 'high')

  const tied = await resolveAuctionMatch(
    fakeDb,
    { title: "Misty's Tentacool 57/132 Gym Challenge", attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(tied.card_id, 201)
  assert.strictEqual(tied.match_method, 'number_first_tiebreak')
  assert.strictEqual(tied.parsed_set_guess?.set_code, 'G2')

  const collisionUnlinked = await resolveAuctionMatch(
    fakeDb,
    { title: 'Trainer 57/132', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(collisionUnlinked.card_id, null)
  assert.strictEqual(collisionUnlinked.parsed_set_candidates.length, 2)

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
