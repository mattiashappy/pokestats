const assert = require('assert')
const { test, describe } = require('node:test')

const { resolveAuctionMatch } = require('../numberFirstMatcher')

const expansions = [
  { set_code: 'PAR', name: 'Paradox Rift', era: 'Scarlet & Violet', set_number: 182 },
  { set_code: 'BSC', name: 'Base Set Custom', era: 'Base', set_total: 102 }
]

const cardsBySetCode = {
  PAR: {
    set_code: 'PAR',
    set_total: 182,
    cards: [
      { id: 1, name: 'Iron Valiant ex', card_number: '89/182' },
      { id: 2, name: 'Mewtwo', card_number: '50/182' },
      { id: 3, name: 'Shiny Vault Test', card_number: '225/182' }
    ]
  },
  BSC: {
    set_code: 'BSC',
    set_total: 102,
    cards: [{ id: 10, name: 'Charizard', card_number: '4/102' }]
  }
}

describe('resolveAuctionMatch set-first flow', () => {
  test('prioritizes set resolution and localized names within that set', async () => {
    const row = {
      title: 'Pokémonkort - Iron Valiant ex 89/182',
      description: 'Scarlet & Violet Paradox Rift booster',
      era: 'Scarlet & Violet'
    }

    const result = await resolveAuctionMatch(null, row, expansions, cardsBySetCode)

    assert.strictEqual(result.parsed_set_guess, 'PAR')
    assert.strictEqual(result.matched_set_code, 'PAR')
    assert.strictEqual(result.parsed_card_number, 89)
    assert.strictEqual(result.matched_card_number, 89)
    assert.strictEqual(result.match_confidence, 'high')
    assert.ok(result.parsed_set_candidates.some((candidate) => candidate.set_code === 'PAR'))
  })

  test('rejects impossible numbers for a set unless a secret entry exists', async () => {
    const row = {
      title: 'Paradox Rift 225/182 ultra rare',
      description: 'Looks legit but number exceeds set',
      era: 'Scarlet & Violet'
    }

    const result = await resolveAuctionMatch(null, row, expansions, { ...cardsBySetCode, PAR: { ...cardsBySetCode.PAR, cards: cardsBySetCode.PAR.cards.filter((c) => c.id !== 3) } })

    assert.strictEqual(result.parsed_set_guess, null)
    assert.strictEqual(result.matched_card_number, null)
    assert.strictEqual(result.set_inference_reason, 'none')
  })

  test('allows secret numbers when explicitly present in the set list', async () => {
    const row = {
      title: 'Paradox Rift secret 225/182',
      description: 'Shiny Vault Test card',
      era: 'Scarlet & Violet'
    }

    const result = await resolveAuctionMatch(null, row, expansions, cardsBySetCode)

    assert.strictEqual(result.parsed_set_guess, 'PAR')
    assert.strictEqual(result.matched_card_number, 225)
    assert.strictEqual(result.match_confidence, 'high')
  })
})
