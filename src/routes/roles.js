const express = require('express');
const Role = require('../models/Role');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { parseName, parsePermissionIds } = require('../utils/access-input');

const router = express.Router();
router.use(authenticateToken, requirePermission('access:manage'));

router.post('/', async (req, res) => {
  const { name, error } = parseName(req.body);
  if (error) return res.status(400).json({ error });
  const parsed = parsePermissionIds(req.body.permissionIds);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    res.status(201).json(await Role.create(name, parsed.permissionIds));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role already exists' });
    if (err.code === '23503') return res.status(400).json({ error: 'A permission does not exist' });
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.get('/', async (req, res) => {
  try {
    res.status(200).json(await Role.findAll());
  } catch (err) {
    console.error('List roles error:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

module.exports = router;
