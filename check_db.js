require('dotenv').config();
const pool = require('./src/config/db');

pool.query('SELECT * FROM leads', (err, res) => {
  if (err) {
    console.error('Database query error:', err.message);
  } else {
    console.log('\n====================================');
    console.log('Database Leads Count:', res.rows.length);
    if (res.rows.length > 0) {
      console.log('Leads found:');
      res.rows.forEach(r => {
        console.log(`- ID: ${r.id}, Name: ${r.full_name}, Email: ${r.email}, Phone: ${r.phone}`);
      });
    } else {
      console.log('No leads found in database.');
    }
    console.log('====================================\n');
  }
  pool.end();
});
