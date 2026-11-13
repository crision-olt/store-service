const pool = require('../config/database');

class Permission {
  static async create(name) {
    const result = await pool.query('INSERT INTO permissions (name) VALUES ($1) RETURNING id, name', [name]);
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query('SELECT id, name FROM permissions ORDER BY name, id');
    return result.rows;
  }
}

module.exports = Permission;
