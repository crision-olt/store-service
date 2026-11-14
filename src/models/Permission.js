const pool = require('../config/database');
const { AccessError } = require('../utils/access-error');

const PROTECTED_PERMISSION = 'access:manage';

class Permission {
  static async create(name) {
    const result = await pool.query('INSERT INTO permissions (name) VALUES ($1) RETURNING id, name', [name]);
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT id, name FROM permissions ORDER BY name, id');
    return result.rows;
  }

  static async #assertEditable(id) {
    const result = await pool.query('SELECT name FROM permissions WHERE id = $1', [id]);
    if (!result.rows[0]) throw new AccessError(404, 'Permission not found');
    if (result.rows[0].name === PROTECTED_PERMISSION) {
      throw new AccessError(409, `The ${PROTECTED_PERMISSION} permission cannot be changed`);
    }
  }

  static async update(id, name) {
    await Permission.#assertEditable(id);
    const result = await pool.query('UPDATE permissions SET name = $2 WHERE id = $1 RETURNING id, name', [id, name]);
    return result.rows[0];
  }

  static async remove(id) {
    await Permission.#assertEditable(id);
    await pool.query('DELETE FROM permissions WHERE id = $1', [id]);
  }
}

module.exports = Permission;
