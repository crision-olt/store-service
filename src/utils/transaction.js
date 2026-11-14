const pool = require('../config/database');

// Serializes transactions that change roles or user-role assignments.
const ACCESS_LOCK_ID = 7301;

const withAccessTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ACCESS_LOCK_ID]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { withAccessTransaction };
