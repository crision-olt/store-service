const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const isId = (id) => Number.isInteger(id) && id > 0 && id <= 2147483647;
const toDiscount = ({ name_es, ...row }) => ({
  ...row,
  nameEs: row.nameEs ?? name_es,
  amount: Number(row.amount),
  roleIds: row.roleIds ?? [],
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, name_es AS "nameEs", kind, amount,
        ARRAY(SELECT role_id FROM discount_roles WHERE discount_id = discounts.id ORDER BY role_id) AS "roleIds"
      FROM discounts ORDER BY id DESC
    `);
    res.json(rows.map(toDiscount));
  } catch (error) {
    next(error);
  }
});

async function save(req, res, next) {
  const { name, nameEs, kind, amount, roleIds } = req.body ?? {};
  const editing = req.params.id !== undefined;
  const id = Number(req.params.id);
  if (editing && (!/^\d+$/.test(req.params.id) || !isId(id))) {
    return res.status(400).json({ error: 'Discount ID must be a positive integer' });
  }
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must contain 1 to 100 characters' });
  }
  if (typeof nameEs !== 'string' || nameEs.trim().length === 0 || nameEs.trim().length > 100) {
    return res.status(400).json({ error: 'Spanish name must contain 1 to 100 characters' });
  }
  if (kind !== 'percentage' && kind !== 'fixed_amount') {
    return res.status(400).json({ error: 'Discount type must be percentage or fixed_amount' });
  }
  if (!Array.isArray(roleIds) || roleIds.length === 0 || roleIds.length > 100 ||
      !roleIds.every(isId) || new Set(roleIds).size !== roleIds.length) {
    return res.status(400).json({ error: 'Select between 1 and 100 distinct roles' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) ||
      Math.round(amount * 100) / 100 !== amount ||
      (kind === 'percentage' ? amount <= 0 || amount > 100 : amount <= 0 || amount > 99999999.99)) {
    return res.status(400).json({ error: 'Enter a valid discount amount with up to two decimals' });
  }

  const selectedRoleIds = [...roleIds].sort((a, b) => a - b);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roles = await client.query(
        'SELECT id FROM roles WHERE id = ANY($1::integer[]) ORDER BY id FOR SHARE',
        [selectedRoleIds]
      );
      if (roles.rows.length !== selectedRoleIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One or more selected roles do not exist' });
      }

      const values = [name.trim(), nameEs.trim(), kind, amount];
      const { rows: [discount] } = editing
        ? await client.query(
          'UPDATE discounts SET name = $1, name_es = $2, kind = $3, amount = $4 WHERE id = $5 RETURNING *',
          [...values, id]
        )
        : await client.query(
          'INSERT INTO discounts (name, name_es, kind, amount) VALUES ($1, $2, $3, $4) RETURNING *',
          values
        );
      if (!discount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Discount not found' });
      }

      if (editing) await client.query('DELETE FROM discount_roles WHERE discount_id = $1', [discount.id]);
      await client.query(
        'INSERT INTO discount_roles (discount_id, role_id) SELECT $1, id FROM unnest($2::integer[]) AS selected(id)',
        [discount.id, selectedRoleIds]
      );
      await client.query('COMMIT');
      return res.status(editing ? 200 : 201).json(toDiscount({ ...discount, roleIds: selectedRoleIds }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

router.post('/', save);
router.put('/:id', save);

module.exports = router;
