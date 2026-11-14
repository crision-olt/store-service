const express = require('express');
const Permission = require('../models/Permission');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { parseName, parseId } = require('../utils/access-input');
const { AccessError } = require('../utils/access-error');

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

const handleError = (res, err, label, duplicate) => {
  if (err instanceof AccessError) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: duplicate });
  if (err.code === '23503') return res.status(409).json({ error: 'Permission is assigned to a role' });
  console.error(`${label} error:`, err);
  res.status(500).json({ error: `Failed to ${label.toLowerCase()}` });
};

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  const { name, error } = parseName(req.body);
  if (error) return res.status(400).json({ error });
  try {
    res.status(200).json(await Permission.update(id, name));
  } catch (err) {
    handleError(res, err, 'Update permission', 'Permission already exists');
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    await Permission.remove(id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Delete permission', 'Permission already exists');
  }
});

module.exports = router;
