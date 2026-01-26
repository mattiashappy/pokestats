const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Checking database schema...');

    // 1. Lägg till language i pt_sets
    await client.query(`
      ALTER TABLE public.pt_sets 
      ADD COLUMN IF NOT EXISTS language VARCHAR(50) DEFAULT 'english';
    `);
    console.log('✅ Added column: language to pt_sets');

    // 2. Lägg till language i pt_cards
    await client.query(`
      ALTER TABLE public.pt_cards 
      ADD COLUMN IF NOT EXISTS language VARCHAR(50) DEFAULT 'english';
    `);
    console.log('✅ Added column: language to pt_cards');

    // 3. Skapa index för snabbare sökning
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pt_sets_language ON public.pt_sets(language);
      CREATE INDEX IF NOT EXISTS idx_pt_cards_language ON public.pt_cards(language);
    `);
    console.log('✅ Indexes created');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run()
