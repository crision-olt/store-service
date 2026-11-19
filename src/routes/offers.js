const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const isId = (id) => Number.isInteger(id) && id > 0 && id <= 2147483647;
const toOffer = ({ minimum_distinct_products, name_es, ...row }) => ({
  ...row,
  nameEs: row.nameEs ?? name_es ?? null,
  amount: Number(row.amount),
  ...(minimum_distinct_products === null ? {} : { minimumDistinctProducts: minimum_distinct_products })
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, name_es AS "nameEs", kind, amount, minimum_distinct_products,
        ARRAY(SELECT product_id FROM offer_products WHERE offer_id = offers.id ORDER BY product_id) AS "productIds"
      FROM offers ORDER BY id DESC
    `);
    res.json(rows.map(toOffer));
  } catch (error) {
    next(error);
  }
});

async function save(req, res, next) {
  const { name, nameEs, kind, amount, productIds, minimumDistinctProducts = null } = req.body ?? {};
  const editing = req.params.id !== undefined;
  const id = Number(req.params.id);
  if (editing && (!/^\d+$/.test(req.params.id) || !isId(id))) {
    return res.status(400).json({ error: 'Offer ID must be a positive integer' });
  }
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must contain 1 to 100 characters' });
  }
  if (typeof nameEs !== 'string' || nameEs.trim().length === 0 || nameEs.trim().length > 100) {
    return res.status(400).json({ error: 'Spanish name must contain 1 to 100 characters' });
  }
  if (kind !== 'menu' && kind !== 'promotion') {
    return res.status(400).json({ error: 'Kind must be menu or promotion' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.round(amount * 100) / 100 !== amount ||
      (kind === 'menu' ? amount < 0 || amount > 99999999.99 : amount <= 0 || amount > 100)) {
    return res.status(400).json({ error: 'Enter a valid menu price or promotion percentage with up to two decimals' });
  }
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > 100 ||
      !productIds.every(isId) || new Set(productIds).size !== productIds.length) {
    return res.status(400).json({ error: 'Select between 1 and 100 distinct products' });
  }
  if (minimumDistinctProducts !== null &&
      (kind !== 'promotion' || !isId(minimumDistinctProducts) || minimumDistinctProducts > productIds.length)) {
    return res.status(400).json({ error: 'The promotion minimum must be between 1 and the number of eligible products' });
  }
  const ids = [...productIds].sort((a, b) => a - b);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const values = [name.trim(), nameEs.trim(), kind, amount, minimumDistinctProducts];
      const { rows: [offer] } = editing
        ? await client.query(
          'UPDATE offers SET name = $1, name_es = $2, kind = $3, amount = $4, minimum_distinct_products = $5 WHERE id = $6 RETURNING *',
          [...values, id]
        )
        : await client.query(
          'INSERT INTO offers (name, name_es, kind, amount, minimum_distinct_products) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          values
        );
      if (!offer) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offer not found' });
      }
      const products = await client.query(
        'SELECT id FROM products WHERE id = ANY($1::integer[]) AND archived_at IS NULL ORDER BY id FOR SHARE',
        [ids]
      );
      if (products.rows.length !== ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One or more selected products are unavailable' });
      }
      if (editing) await client.query('DELETE FROM offer_products WHERE offer_id = $1', [offer.id]);
      await client.query(
        'INSERT INTO offer_products (offer_id, product_id) SELECT $1, id FROM unnest($2::integer[]) AS selected(id)',
        [offer.id, ids]
      );
      await client.query('COMMIT');
      return res.status(editing ? 200 : 201).json(toOffer({ ...offer, productIds: ids }));
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
