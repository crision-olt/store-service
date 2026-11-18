const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, code, name, name_es AS "nameEs" FROM allergens ORDER BY id');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
