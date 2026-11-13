const pool = require('../config/database');

const requirePermission = (name) => async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM users u
        JOIN role_permissions rp ON rp.role_id = u.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = $1 AND p.name = $2
      ) AS allowed`,
      [req.userId, name]
    );
    if (!result.rows[0].allowed) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (err) {
    console.error('Permission check error:', err);
    res.status(500).json({ error: 'Failed to check permission' });
  }
};

module.exports = { requirePermission };
