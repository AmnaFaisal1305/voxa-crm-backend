const { Pool } = require('pg');

// Create pg Pool instance using environment's connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
