const assert = require('assert')
const { resolveAuctionMatch } = require('./numberFirstMatcher')

const fakeExpansions = [
  { id: 1, name: 'Base Set', set_code: 'BASE', era: 'wizards of the coast', set_total: 102 },
  { id: 2, name: 'Gym Challenge', set_code: 'G2', era: 'wizards of the coast', set_total: 132 },
  { id: 3, name: 'Gym Heroes', set_code: 'G1', era: 'wizards of the coast', set_total: 132 },
  { id: 4, name: 'Jungle', set_code: 'JUNGLE', era: 'wizards of the coast', set_total: 64 }
]

const fakeCards = [
  { id: 101, expansion_id: 1, card_number: '15/102', name: 'Venusaur' },
  { id: 201, expansion_id: 2, card_number: '57/132', name: "Misty's Tentacool" },
  { id: 301, expansion_id: 3, card_number: '13/132', name: 'Dark Vileplume' },
  { id: 401, expansion_id: 4, card_number: '14/64', name: 'Suicune' }
]

const fakeDb = {
  async query(sql, params) {
    if (sql.includes('expansion_id = ANY')) {
      const [ids, cardNumber] = params
      const rows = fakeCards
        .filter((card) => ids.includes(card.expansion_id) && (!cardNumber || card.card_number === cardNumber))
        .map((card) => ({ id: card.id, expansion_id: card.expansion_id }))
      return { rows }
    }

    if (sql.includes('name ILIKE')) {
      const [expansionId, nameLike] = params
      const rows = fakeCards
        .filter((card) => card.expansion_id === expansionId && card.name.toLowerCase().includes(nameLike.replace(/%/g, '').toLowerCase()))
        .map((card) => ({ id: card.id }))
      return { rows }
    }

    const [expansionId, cardNumber] = params
    const rows = fakeCards
      .filter((card) => card.expansion_id === expansionId && card.card_number === cardNumber)
      .map((card) => ({ id: card.id }))
    return { rows }
  }
}

async function runHarness() {
  const era = ['Wizards of the Coast 1999-2003']

  const direct = await resolveAuctionMatch(
    fakeDb,
    { title: 'Venusaur 015/102 Base Set', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(direct.card_id, 101)
  assert.strictEqual(direct.match_method, 'number_first')

  const tied = await resolveAuctionMatch(
    fakeDb,
    { title: "Misty's Tentacool 57/132 Gym Challenge", attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(tied.card_id, 201)
  assert.strictEqual(tied.match_method, 'number_first_tiebreak')

  const nameTiebreak = await resolveAuctionMatch(
    fakeDb,
    { title: 'Dark Vileplume 13-132', attributes: { pokemon_era: era } },
    fakeExpansions
  )
  assert.strictEqual(nameTiebreak.card_id, 301)
  assert.strictEqual(nameTiebreak.match_method, 'number_first_tiebreak')

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
