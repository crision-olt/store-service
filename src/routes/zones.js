const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT z.id, z.name, z.has_outside AS "hasOutside", z.is_base AS "isBase",
        ARRAY(SELECT t.number FROM restaurant_tables t WHERE t.zone_id = z.id ORDER BY t.number) AS "tableNumbers"
      FROM restaurant_zones z ORDER BY z.id
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

async function saveZone(req, res, next) {
  const { name: rawName, hasOutside, tableNumbers, isBase } = req.body ?? {};
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const id = req.params.id === undefined ? null : Number(req.params.id);
  if ((id !== null && (!/^\d+$/.test(req.params.id) || id < 1 || id > 2147483647)) ||
      !name || name.length > 100 || typeof hasOutside !== 'boolean' || !Array.isArray(tableNumbers) ||
      (isBase !== undefined && typeof isBase !== 'boolean') ||
      tableNumbers.length > 50 || new Set(tableNumbers).size !== tableNumbers.length ||
      !tableNumbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 50)) {
    return res.status(400).json({ error: 'Invalid zone settings' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize availability checks with table settings, resizing, and other zone saves.
      await client.query('LOCK TABLE restaurant_tables IN SHARE ROW EXCLUSIVE MODE');
      if (id !== null && !(await client.query('SELECT id FROM restaurant_zones WHERE id = $1', [id])).rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Zone not found' });
      }

      const { rows: tables } = await client.query(`
        SELECT number, zone_id, is_outside FROM restaurant_tables WHERE number = ANY($1::integer[]) ORDER BY number
      `, [tableNumbers]);
      if (tables.length !== tableNumbers.length || tables.some((table) => table.zone_id !== null && table.zone_id !== id)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'One or more tables are no longer available' });
      }
      if (!hasOutside && tables.some((table) => table.is_outside)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Outdoor tables require a zone with an outdoor area' });
      }

      if (isBase) {
        await client.query('UPDATE restaurant_zones SET is_base = FALSE WHERE is_base AND id IS DISTINCT FROM $1', [id]);
      }

      let zone;
      if (id === null) {
        const { rows } = await client.query(
          `INSERT INTO restaurant_zones (name, has_outside, is_base) VALUES ($1, $2, $3)
           RETURNING id, is_base AS "isBase"`, [name, hasOutside, isBase ?? false],
        );
        zone = rows[0];
      } else {
        await client.query(`
          UPDATE restaurant_tables SET zone_id = NULL WHERE zone_id = $1 AND NOT (number = ANY($2::integer[]))
        `, [id, tableNumbers]);
        const { rows } = await client.query(
          `UPDATE restaurant_zones SET name = $1, has_outside = $2, is_base = COALESCE($3, is_base)
           WHERE id = $4 RETURNING id, is_base AS "isBase"`, [name, hasOutside, isBase ?? null, id],
        );
        zone = rows[0];
      }
      await client.query(`
        UPDATE restaurant_tables SET zone_id = $1 WHERE zone_id IS NULL AND number = ANY($2::integer[])
      `, [zone.id, tableNumbers]);
      await client.query('COMMIT');
      return res.status(id === null ? 201 : 200).json({ ...zone, name, hasOutside, tableNumbers: tables.map((table) => table.number) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

router.post('/', saveZone);
router.put('/:id', saveZone);

module.exports = router;
