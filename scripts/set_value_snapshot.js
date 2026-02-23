#!/usr/bin/env node
const { Pool } = require('pg')

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  })

  try {
    await pool.query('BEGIN')

    await pool.query(`
      INSERT INTO public.set_value_snapshots (set_id, date, market_total)
      SELECT
        ps.pt_set_id AS set_id,
        CURRENT_DATE AS date,
        COALESCE(SUM(pc.price_market), 0)::numeric AS market_total
      FROM public.pt_sets ps
      LEFT JOIN public.pt_cards pc ON pc.pt_set_id = ps.pt_set_id
      GROUP BY ps.pt_set_id
      ON CONFLICT (set_id, date)
      DO UPDATE SET
        market_total = EXCLUDED.market_total,
        created_at = now()
    `)

    await pool.query('COMMIT')
    console.log('Set value snapshots refreshed for current date.')
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Failed to refresh set value snapshots', error)
  process.exit(1)
})
