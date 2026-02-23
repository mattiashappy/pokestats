const test = require('node:test')
const assert = require('node:assert/strict')

const { createExpansionService } = require('./expansions')

test('fetchExpansionSummaries coerces numeric fields to numbers/null', async () => {
  const responses = [
    { rows: [{ table_name: 'pt_sets' }] },
    { rows: [{ pt_sets: 'pt_sets', pt_cards: 'pt_cards' }] },
    { rows: [{ set_value_snapshots: 'set_value_snapshots' }] },
    { rows: [{ v_set_metrics_current: 'v_set_metrics_current' }] },
    {
      rows: [
        {
          set_id: 'sv1',
          set_code: 'sv1',
          name: 'Scarlet & Violet',
          era: 'Scarlet & Violet',
          language: 'english',
          card_count: '198',
          cards_total: '198',
          set_total: '198',
          market_total: '1234.56',
          set_market_total: '1234.56',
          mom_change_pct: '0.1234000000000000',
          mom_change_value: '10.55',
          set_market_change_pct: null
        }
      ]
    }
  ]

  let queryIndex = 0
  const pool = {
    async query() {
      const response = responses[queryIndex]
      queryIndex += 1
      return response
    }
  }

  const service = createExpansionService({ pool })
  const rows = await service.fetchExpansionSummaries('english')

  assert.equal(rows.length, 1)
  assert.equal(typeof rows[0].mom_change_pct, 'number')
  assert.equal(typeof rows[0].mom_change_value, 'number')
  assert.equal(typeof rows[0].market_total, 'number')
  assert.equal(typeof rows[0].card_count, 'number')
  assert.equal(rows[0].set_market_change_pct, 0.1234)
})
