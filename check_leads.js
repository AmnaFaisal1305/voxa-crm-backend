require('dotenv').config();
const pool = require('./src/config/db');

pool.query('SELECT * FROM leads ORDER BY created_at DESC', (err, res) => {
  if (err) {
    console.error('Error fetching leads:', err.message);
  } else {
    console.log(`\nCaptured Leads in Database: ${res.rows.length}`);
    if (res.rows.length > 0) {
      console.log('Most recent captured lead details:');
      console.log('---------------------------------');
      res.rows.forEach((row, i) => {
        console.log(`[Lead ${i+1}] Name: ${row.full_name}, Email: ${row.email}, Phone: ${row.phone}, Status: ${row.lead_status}, Form: ${row.form_id}`);
      });
    }
  }
  pool.end();
});
