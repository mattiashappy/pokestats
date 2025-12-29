const { resolveAuctionMatch } = require('./numberFirstMatcher')

async function runHarness(db) {
  const fakeExpansions = [
    { id: 1, name: 'Base Set', set_code: 'BASE', era: 'wizards of the coast', set_total: 102 },
    { id: 2, name: 'Gym Challenge', set_code: 'G2', era: 'wizards of the coast', set_total: 132 },
    { id: 3, name: 'Gym Heroes', set_code: 'G1', era: 'wizards of the coast', set_total: 132 },
    { id: 4, name: 'Jungle', set_code: 'JUNGLE', era: 'wizards of the coast', set_total: 64 }
  ]

  const fakeDb = {
    async query(sql, params) {
      const [expansionId, cardNumber] = params
      if (!expansionId || !cardNumber) return { rows: [] }
      return { rows: [{ id: 999, expansion_id: expansionId }] }
    }
  }

  const examples = [
    { title: "Venusaur 015/102 Base Set", expectedSetTotal: 102 },
    { title: "Misty's Tentacool 57/132 Gym Challenge", expectedSetTotal: 132 },
    { title: 'Dark Vileplume 13/132 Gym Heroes', expectedSetTotal: 132 },
    { title: 'Suicune 14/64 Neo Revelation', expectedSetTotal: 64 }
  ]

  for (const example of examples) {
    const result = await resolveAuctionMatch(fakeDb, { title: example.title, attributes: { pokemon_era: ['Wizards of the Coast 1999-2003'] } }, fakeExpansions)
    console.log(example.title, '->', result.parsed_card_number, 'card', result.card_id)
  }
}

if (require.main === module) {
  runHarness().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { runHarness }
