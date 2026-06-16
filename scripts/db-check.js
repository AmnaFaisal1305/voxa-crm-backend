require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));

  for (const { tablename } of tables.rows) {
    const count = await pool.query(`SELECT COUNT(*) FROM "${tablename}"`);
    console.log(`  ${tablename}: ${count.rows[0].count} rows`);
  }
  await pool.end();
}

run().catch(e => { console.error(e.message); pool.end(); });
