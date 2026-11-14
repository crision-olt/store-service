const pool = require('../config/database');
const { AccessError } = require('../utils/access-error');
const { withAccessTransaction } = require('../utils/transaction');

const PROTECTED_ROLE = 'user';

const selectRoles = (client, id) => client.query(
  `SELECT r.id, r.name,
    COALESCE(json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name, p.id)
      FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS permissions
  FROM roles r
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
  WHERE $1::integer IS NULL OR r.id = $1
  GROUP BY r.id
  ORDER BY r.name, r.id`,
  [id ?? null]
);

const findLockedRole = async (client, id) => {
  const result = await client.query('SELECT name FROM roles WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AccessError(404, 'Role not found');
  return result.rows[0];
};

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
    const result = await selectRoles(pool);
    return result.rows;
  }

  static async update(id, name, permissionIds) {
    return withAccessTransaction(async (client) => {
      const role = await findLockedRole(client, id);
      if (role.name === PROTECTED_ROLE && name !== PROTECTED_ROLE) {
        throw new AccessError(409, `The ${PROTECTED_ROLE} role cannot be renamed`);
      }
      await client.query('UPDATE roles SET name = $2 WHERE id = $1', [id, name]);
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, requested.id FROM unnest($2::integer[]) AS requested(id)`,
        [id, permissionIds]
      );
      return (await selectRoles(client, id)).rows[0];
    });
  }

  static async remove(id) {
    return withAccessTransaction(async (client) => {
      const role = await findLockedRole(client, id);
      if (role.name === PROTECTED_ROLE) throw new AccessError(409, `The ${PROTECTED_ROLE} role cannot be deleted`);
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      await client.query('DELETE FROM roles WHERE id = $1', [id]);
    });
  }
}

module.exports = Role;
