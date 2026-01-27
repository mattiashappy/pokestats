const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("🧹 Cleaning up broken sets...");

    // Delete sets that have NO cards associated with them
    // This removes the "Ghost" sets so we can re-download them with correct IDs
    const res = await client.query(`
      DELETE FROM public.pt_sets 
      WHERE pt_set_id IN (
        SELECT s.pt_set_id 
        FROM public.pt_sets s
        LEFT JOIN public.pt_cards c ON s.pt_set_id = c.pt_set_id
        WHERE c.pt_card_id IS NULL
      );
    `);

    console.log(`✅ Deleted ${res.rowCount} empty sets with broken IDs.`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
