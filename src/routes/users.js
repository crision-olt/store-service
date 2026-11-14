const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { parseId, parseRoleId } = require('../utils/access-input');
const { AccessError } = require('../utils/access-error');

const router = express.Router();
router.use(authenticateToken, requirePermission('access:manage'));

router.get('/', async (req, res) => {
  try {
    res.status(200).json(await User.findAllWithRoles());
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/:id/role', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  const { roleId, error } = parseRoleId(req.body);
  if (error) return res.status(400).json({ error });
  try {
    res.status(200).json(await User.updateRole(id, roleId));
  } catch (err) {
    if (err instanceof AccessError) return res.status(err.status).json({ error: err.message });
    if (err.code === '23503') return res.status(400).json({ error: 'The role does not exist' });
    console.error('Update user role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;
