const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { parseId, parseUserInput } = require('../utils/access-input');
const { AccessError } = require('../utils/access-error');
const sessions = require('../utils/sessions');

const router = express.Router();
router.use(authenticateToken);

const handleError = (res, err, label) => {
  if (err instanceof AccessError) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'User already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'The role does not exist' });
  console.error(`${label} error:`, err);
  res.status(500).json({ error: `Failed to ${label.toLowerCase()}` });
};

router.get('/', async (req, res) => {
  try {
    res.status(200).json(await User.findAllWithRoles());
  } catch (err) {
    handleError(res, err, 'List users');
  }
});

router.post('/', async (req, res) => {
  const { email, roleId, password, error } = parseUserInput(req.body, { passwordRequired: true });
  if (error) return res.status(400).json({ error });
  try {
    res.status(201).json(await User.createWithRole(email, password, roleId));
  } catch (err) {
    handleError(res, err, 'Create user');
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  const { email, roleId, password, error } = parseUserInput(req.body, { passwordRequired: false });
  if (error) return res.status(400).json({ error });
  try {
    res.status(200).json(await User.update(id, { email, roleId, password }));
  } catch (err) {
    handleError(res, err, 'Update user');
  }
});

router.put('/:id/block', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  if (id === req.userId) return res.status(409).json({ error: 'You cannot block your own account' });
  try {
    const user = await User.setBlocked(id, true);
    sessions.closeUser(id);
    res.status(200).json(user);
  } catch (err) {
    handleError(res, err, 'Block user');
  }
});

router.delete('/:id/block', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a positive integer' });
  try {
    res.status(200).json(await User.setBlocked(id, false));
  } catch (err) {
    handleError(res, err, 'Unblock user');
  }
});

module.exports = router;
