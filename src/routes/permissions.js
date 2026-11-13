const express = require('express');
const Permission = require('../models/Permission');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { parseName } = require('../utils/access-input');

const router = express.Router();
router.use(authenticateToken, requirePermission('access:manage'));

router.post('/', async (req, res) => {
  const { name, error } = parseName(req.body);
  if (error) return res.status(400).json({ error });
  try {
    res.status(201).json(await Permission.create(name));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Permission already exists' });
    console.error('Create permission error:', err);
    res.status(500).json({ error: 'Failed to create permission' });
  }
});

router.get('/', async (req, res) => {
  try {
    res.status(200).json(await Permission.findAll());
  } catch (err) {
    console.error('List permissions error:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

module.exports = router;
