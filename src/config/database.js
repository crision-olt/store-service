const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.STORE_DB_CONNECTION
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
