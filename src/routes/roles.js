const express = require('express');
const Role = require('../models/Role');
const { authenticateToken } = require('../middleware/auth');
const { parseName, parsePermissionIds, parseId } = require('../utils/access-input');
const { AccessError } = require('../utils/access-error');

const router = express.Router();
router.use(authenticateToken);

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

const handleError = (res, err, label) => {
  if (err instanceof AccessError) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'Role already exists' });
  if (err.code === '23503') {
    return err.constraint?.includes('users')
      ? res.status(409).json({ error: 'Role is assigned to users' })
      : res.status(400).json({ error: 'A permission does not exist' });
  }
  console.error(`${label} error:`, err);
  res.status(500).json({ error: `Failed to ${label.toLowerCase()}` });
};

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  const { name, error } = parseName(req.body);
  if (error) return res.status(400).json({ error });
  const parsed = parsePermissionIds(req.body.permissionIds);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    res.status(200).json(await Role.update(id, name, parsed.permissionIds));
  } catch (err) {
    handleError(res, err, 'Update role');
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    await Role.remove(id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err, 'Delete role');
  }
});

module.exports = router;
