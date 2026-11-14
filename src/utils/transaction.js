const pool = require('../config/database');
const { AccessError } = require('./access-error');

// Serializes every transaction that can change who holds access:manage.
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

const assertAccessManagerRemains = async (client) => {
  const { rows } = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM users u
      JOIN role_permissions rp ON rp.role_id = u.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.name = 'access:manage'
    ) AS present`
  );
  if (!rows[0].present) {
    throw new AccessError(409, 'At least one user must keep the access:manage permission');
  }
};

module.exports = { withAccessTransaction, assertAccessManagerRemains };
