const pool = require('../config/database');

class Role {
  static async create(name, permissionIds) {
    const result = await pool.query(
      `WITH new_role AS (
        INSERT INTO roles (name) VALUES ($1) RETURNING id, name
      ), links AS (
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT new_role.id, requested.id
        FROM new_role CROSS JOIN unnest($2::integer[]) AS requested(id)
        RETURNING permission_id
      )
      SELECT new_role.id, new_role.name,
        COALESCE((
          SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name, p.id)
          FROM links JOIN permissions p ON p.id = links.permission_id
        ), '[]'::json) AS permissions
      FROM new_role`,
      [name, permissionIds]
    );
    return result.rows[0];
  }

  static async findAll() {
    const result = await pool.query(
      `SELECT r.id, r.name,
        COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name, p.id)
          FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.name, r.id`
    );
    return result.rows;
  }
}

module.exports = Role;
