const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const selectTables = `
  SELECT number, capacity, is_outside AS "isOutside", is_accessible AS "isAccessible"
  FROM restaurant_tables ORDER BY number
`;

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(selectTables);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  const { count, expectedCount } = req.body ?? {};
  if (!Number.isInteger(count) || count < 1 || count > 50 ||
      !Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount > 50) {
    return res.status(400).json({ error: 'Invalid table count or expected count' });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE restaurant_tables IN EXCLUSIVE MODE');
      const current = await client.query('SELECT count(*)::integer AS count FROM restaurant_tables');
      if (current.rows[0].count !== expectedCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Table count changed; reload and try again' });
      }
      await client.query('DELETE FROM restaurant_tables WHERE number > $1', [count]);
      await client.query(`
        INSERT INTO restaurant_tables (number)
        SELECT number FROM generate_series(1, $1::integer) AS number
        ON CONFLICT (number) DO NOTHING
      `, [count]);
      const { rows } = await client.query(selectTables);
      await client.query('COMMIT');
      return res.json(rows);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

router.put('/:number', async (req, res, next) => {
  const number = Number(req.params.number);
  const { capacity, isOutside, isAccessible } = req.body ?? {};
  if (!/^\d+$/.test(req.params.number) || !Number.isInteger(number) || number < 1 || number > 50 ||
      ![2, 4, 6, 8].includes(capacity) || typeof isOutside !== 'boolean' || typeof isAccessible !== 'boolean') {
    return res.status(400).json({ error: 'Invalid table number or settings' });
  }
  try {
    const { rows } = await pool.query(`
      UPDATE restaurant_tables SET capacity = $1, is_outside = $2, is_accessible = $3
      WHERE number = $4
      RETURNING number, capacity, is_outside AS "isOutside", is_accessible AS "isAccessible"
    `, [capacity, isOutside, isAccessible, number]);
    if (!rows[0]) return res.status(404).json({ error: 'Table not found' });
    return res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
