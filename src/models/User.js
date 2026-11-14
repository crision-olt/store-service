const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { AccessError } = require('../utils/access-error');
const { withAccessTransaction } = require('../utils/transaction');

const selectUsers = (client, id) => client.query(
  `SELECT u.id, u.email, json_build_object('id', r.id, 'name', r.name) AS role
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

  static async updateRole(id, roleId) {
    return withAccessTransaction(async (client) => {
      const result = await client.query('UPDATE users SET role_id = $2 WHERE id = $1', [id, roleId]);
      if (result.rowCount === 0) throw new AccessError(404, 'User not found');
      return (await selectUsers(client, id)).rows[0];
    });
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = User;
