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

  assert.equal((await call('GET', '/users', undefined, 2)).status, 403);

  const read = (await call('POST', '/permissions', { name: 'products:read' })).body;
  const write = (await call('POST', '/permissions', { name: 'products:write' })).body;
  const role = (await call('POST', '/roles', { name: 'reader', permissionIds: [read.id] })).body;

  let response = await call('PUT', `/permissions/${write.id}`, { name: 'products:edit' });
  assert.deepEqual(response, { status: 200, body: { id: write.id, name: 'products:edit' } });
  assert.equal((await call('PUT', `/permissions/${write.id}`, { name: 'products:read' })).status, 409);
  assert.equal((await call('PUT', '/permissions/1', { name: 'renamed' })).status, 409);
  assert.equal((await call('DELETE', '/permissions/1')).status, 409);
  assert.equal((await call('DELETE', `/permissions/${read.id}`)).status, 409);
  assert.equal((await call('DELETE', '/permissions/999')).status, 404);
  assert.equal((await call('DELETE', '/permissions/abc')).status, 400);
  assert.equal((await call('DELETE', `/permissions/${write.id}`)).status, 204);

  response = await call('PUT', `/roles/${role.id}`, { name: 'viewer', permissionIds: [] });
  assert.deepEqual(response.body, { id: role.id, name: 'viewer', permissions: [] });
  assert.equal((await call('PUT', `/roles/${role.id}`, { name: 'admin', permissionIds: [] })).status, 409);
  assert.equal((await call('PUT', `/roles/${role.id}`, { name: 'viewer', permissionIds: [999] })).status, 400);
  assert.equal((await call('PUT', '/roles/999', { name: 'x', permissionIds: [] })).status, 404);
  assert.equal((await call('PUT', '/roles/1', { name: 'guest', permissionIds: [] })).status, 409);

  assert.deepEqual((await call('GET', '/users')).body, [
    { id: 1, email: 'admin@example.com', role: { id: 2, name: 'admin' } },
    { id: 2, email: 'member@example.com', role: { id: 1, name: 'user' } }
  ]);
  response = await call('PUT', '/users/2/role', { roleId: role.id });
  assert.deepEqual(response.body, { id: 2, email: 'member@example.com', role: { id: role.id, name: 'viewer' } });
  assert.equal((await call('PUT', '/users/2/role', { roleId: 999 })).status, 400);
  assert.equal((await call('PUT', '/users/999/role', { roleId: 1 })).status, 404);
  assert.equal((await call('PUT', '/users/2/role', { roleId: '1' })).status, 400);

  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 409);
  assert.equal((await call('DELETE', '/roles/1')).status, 409);
  await call('PUT', '/users/2/role', { roleId: 1 });
  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 204);
  assert.equal((await call('DELETE', `/roles/${role.id}`)).status, 404);
});
