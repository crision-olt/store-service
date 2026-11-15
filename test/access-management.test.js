const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');

test('manages roles, permissions and user roles', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(join(__dirname, '../sql/init.sql'), 'utf8'));
  await db.exec(`
    INSERT INTO roles (name) VALUES ('user');
    INSERT INTO users (email, password, role_id) VALUES
      ('admin@example.com', 'x', (SELECT id FROM roles WHERE name = 'admin')),
      ('member@example.com', 'x', (SELECT id FROM roles WHERE name = 'user'));
  `);
  const databasePath = require.resolve('../src/config/database');
  require.cache[databasePath] = {
    id: databasePath, filename: databasePath, loaded: true,
    exports: {
      query: (sql, params) => db.query(sql, params),
      connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} })
    }
  };
  t.after(() => { delete require.cache[databasePath]; });

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/permissions', require('../src/routes/permissions'));
  app.use('/roles', require('../src/routes/roles'));
  app.use('/users', require('../src/routes/users'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, userId = 1) => {
    const response = await fetch(url + path, {
      method,
      headers: { Cookie: `token=${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };

  const read = (await call('POST', '/permissions', { name: 'reports:read' })).body;
  const write = (await call('POST', '/permissions', { name: 'reports:write' })).body;
  const role = (await call('POST', '/roles', { name: 'reader', permissionIds: [read.id] })).body;

  let response = await call('PUT', `/permissions/${write.id}`, { name: 'reports:edit' });
  assert.deepEqual(response, { status: 200, body: { id: write.id, name: 'reports:edit' } });
  assert.equal((await call('PUT', `/permissions/${write.id}`, { name: 'reports:read' })).status, 409);
  assert.equal((await call('PUT', '/permissions/999', { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/permissions/${read.id}`)).status, 409);
  assert.equal((await call('DELETE', '/permissions/999')).status, 404);
  assert.equal((await call('DELETE', '/permissions/abc')).status, 400);
  assert.equal((await call('DELETE', `/permissions/${write.id}`)).status, 204);

  response = await call('PUT', `/roles/${role.id}`, { name: 'viewer', permissionIds: [] });
  assert.deepEqual(response.body, { id: role.id, name: 'viewer', permissions: [] });
  assert.equal((await call('PUT', `/roles/${role.id}`, { name: 'admin', permissionIds: [] })).status, 409);
  assert.equal((await call('PUT', `/roles/${role.id}`, { name: 'viewer', permissionIds: [999] })).status, 400);
  assert.equal((await call('PUT', '/roles/999', { name: 'x', permissionIds: [] })).status, 404);
  assert.equal((await call('PUT', '/roles/2', { name: 'guest', permissionIds: [] })).status, 409);

  const bare = ({ created_at, ...user }) => { assert.ok(created_at); return user; };
  assert.deepEqual((await call('GET', '/users')).body.map(bare), [
    { id: 1, email: 'admin@example.com', role: { id: 1, name: 'admin' } },
    { id: 2, email: 'member@example.com', role: { id: 2, name: 'user' } }
  ]);

  response = await call('POST', '/users', { email: ' New@Example.com ', password: 'secret-pass', roleId: role.id });
  assert.equal(response.status, 201);
  assert.deepEqual(bare(response.body), { id: 3, email: 'New@Example.com', role: { id: role.id, name: 'viewer' } });
  const stored = await db.query('SELECT password FROM users WHERE id = 3');
  assert.match(stored.rows[0].password, /^\$2[aby]\$/);
  assert.equal((await call('POST', '/users', { email: 'New@Example.com', password: 'secret-pass', roleId: 2 })).status, 409);
  assert.equal((await call('POST', '/users', { email: 'bad', password: 'secret-pass', roleId: 2 })).status, 400);
  assert.equal((await call('POST', '/users', { email: 'a@b.co', password: 'short', roleId: 2 })).status, 400);
  assert.equal((await call('POST', '/users', { email: 'a@b.co', password: 'secret-pass', roleId: '1' })).status, 400);
  assert.equal((await call('POST', '/users', { email: 'a@b.co', password: 'secret-pass', roleId: 999 })).status, 400);

  response = await call('PUT', '/users/2', { email: 'renamed@example.com', roleId: role.id });
  assert.deepEqual(bare(response.body), { id: 2, email: 'renamed@example.com', role: { id: role.id, name: 'viewer' } });
  const before = (await db.query('SELECT password FROM users WHERE id = 2')).rows[0].password;
  assert.equal(before, 'x');
  response = await call('PUT', '/users/2', { email: 'renamed@example.com', roleId: role.id, password: 'another-pass' });
  assert.equal(response.status, 200);
  assert.notEqual((await db.query('SELECT password FROM users WHERE id = 2')).rows[0].password, 'x');
  assert.equal((await call('PUT', '/users/2', { email: 'New@Example.com', roleId: 2 })).status, 409);
  assert.equal((await call('PUT', '/users/2', { email: 'renamed@example.com', roleId: 999 })).status, 400);
  assert.equal((await call('PUT', '/users/999', { email: 'x@y.co', roleId: 2 })).status, 404);
  assert.equal((await call('PUT', '/users/2', { email: 'x@y.co', roleId: 2, password: 'short' })).status, 400);

  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 409);
  assert.equal((await call('DELETE', '/roles/2')).status, 409);
  await call('PUT', '/users/2', { email: 'renamed@example.com', roleId: 2 });
  await call('PUT', '/users/3', { email: 'New@Example.com', roleId: 2 });
  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 204);
  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 404);
});
