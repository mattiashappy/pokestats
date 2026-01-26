const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Upgrading table pt_cards...');

    // 1. Add Descriptive Fields
    await client.query(`
      ALTER TABLE public.pt_cards 
      ADD COLUMN IF NOT EXISTS pokemon_type TEXT,
      ADD COLUMN IF NOT EXISTS energy_type TEXT[], -- Array for multiple energies
      ADD COLUMN IF NOT EXISTS stage TEXT,
      ADD COLUMN IF NOT EXISTS flavor_text TEXT;
    `);
    console.log('✅ Added descriptive columns (pokemon_type, energy_type, stage, flavor_text)');

    // 2. Add JSONB column for FULL pricing data (listings, low, variants, etc.)
    await client.query(`
      ALTER TABLE public.pt_cards 
      ADD COLUMN IF NOT EXISTS prices_data JSONB DEFAULT '{}'::jsonb;
    `);
    console.log('✅ Added "prices_data" JSONB column');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
