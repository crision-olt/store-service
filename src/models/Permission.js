const pool = require('../config/database');
const { AccessError } = require('../utils/access-error');

class Permission {
  static async create(name) {
    const result = await pool.query('INSERT INTO permissions (name) VALUES ($1) RETURNING id, name', [name]);
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT id, name FROM permissions ORDER BY name, id');
    return result.rows;
  }

  static async update(id, name) {
    const result = await pool.query('UPDATE permissions SET name = $2 WHERE id = $1 RETURNING id, name', [id, name]);
    if (!result.rows[0]) throw new AccessError(404, 'Permission not found');
    return result.rows[0];
  }

  static async remove(id) {
    const result = await pool.query('DELETE FROM permissions WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new AccessError(404, 'Permission not found');
  }
}

module.exports = Permission;
