const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { AccessError } = require('../utils/access-error');

const selectUsers = (client, id) => client.query(
  `SELECT u.id, u.email, u.created_at, json_build_object('id', r.id, 'name', r.name) AS role
   FROM users u JOIN roles r ON r.id = u.role_id
   WHERE $1::integer IS NULL OR u.id = $1
   ORDER BY u.email, u.id`,
  [id ?? null]
);

class User {
  static async create(email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password, role_id)
       VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'user'))
       RETURNING id, email, created_at`,
      [email, hashedPassword]
    );
    return result.rows[0];
  }

  static async createWithRole(email, password, roleId) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, role_id) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, roleId]
    );
    return (await selectUsers(pool, result.rows[0].id)).rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT id, email, password, created_at FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findAllWithRoles() {
    const result = await selectUsers(pool);
    return result.rows;
  }

  static async update(id, { email, roleId, password }) {
    const hashedPassword = password === undefined ? null : await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE users SET email = $2, role_id = $3, password = COALESCE($4, password) WHERE id = $1`,
      [id, email, roleId, hashedPassword]
    );
    if (result.rowCount === 0) throw new AccessError(404, 'User not found');
    return (await selectUsers(pool, id)).rows[0];
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = User;
