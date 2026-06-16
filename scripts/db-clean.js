require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query('TRUNCATE TABLE leads, meta_forms RESTART IDENTITY CASCADE');
  console.log('Database cleaned: leads and meta_forms truncated, IDs reset.');

  const leads = await pool.query('SELECT COUNT(*) FROM leads');
  const forms = await pool.query('SELECT COUNT(*) FROM meta_forms');
  console.log(`  leads: ${leads.rows[0].count} rows`);
  console.log(`  meta_forms: ${forms.rows[0].count} rows`);
  await pool.end();
}

run().catch(e => { console.error(e.message); pool.end(); });
