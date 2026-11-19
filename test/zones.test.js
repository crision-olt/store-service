const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');

test('creates and edits zones with exclusive table assignments and outdoor eligibility', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(join(__dirname, '../sql/tables.sql'), 'utf8'));
  await db.exec('INSERT INTO restaurant_tables (number, is_outside) VALUES (1, false), (2, true), (3, false)');
  const migration = await readFile(join(__dirname, '../sql/zones.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  t.mock.method(pool, 'query', db.query.bind(db));
  t.mock.method(pool, 'connect', async () => ({ query: db.query.bind(db), release() {} }));
  t.mock.method(User, 'isActive', async () => true);
  process.env.JWT_SECRET = 'test-secret';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const response = await fetch(url + path, {
      method,
      headers: { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const indoor = { name: 'Dining room', hasOutside: false, tableNumbers: [1] };
  const mixed = { name: 'Gallery', hasOutside: true, tableNumbers: [2, 3] };
  assert.equal((await fetch(`${url}/zones`)).status, 401);
  const created = await call('POST', '/zones', indoor);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: created.body.id, ...indoor });
  assert.equal((await call('POST', '/zones', { ...indoor, tableNumbers: [2] })).status, 400);
  assert.equal((await call('POST', '/zones', { ...mixed, tableNumbers: [1, 2] })).status, 409);
  assert.equal((await call('POST', '/zones', { ...mixed, tableNumbers: [4] })).status, 409);
  const second = await call('POST', '/zones', mixed);
  assert.equal(second.status, 201);
  const mixedPath = `/zones/${second.body.id}`;
  assert.equal((await call('PUT', mixedPath, { ...mixed, hasOutside: false })).status, 400);
  assert.deepEqual((await call('GET', '/zones')).body, [created.body, second.body]);

  const updated = { id: second.body.id, name: 'Gallery', hasOutside: false, tableNumbers: [3] };
  assert.deepEqual(await call('PUT', mixedPath, updated), { status: 200, body: updated });
  const terrace = await call('POST', '/zones', { name: 'Terrace', hasOutside: true, tableNumbers: [2] });
  assert.equal(terrace.status, 201);
  const tableSettings = { capacity: 4, isOutside: true, isAccessible: false };
  assert.equal((await call('PUT', '/tables/1', tableSettings)).status, 409);
  assert.deepEqual(await call('PUT', '/tables/1', { ...tableSettings, isOutside: false }), {
    status: 200, body: { number: 1, ...tableSettings, isOutside: false },
  });
  assert.equal((await call('PUT', '/tables', { count: 2, expectedCount: 3 })).status, 200);
  assert.deepEqual((await call('GET', '/zones')).body, [created.body, { ...updated, tableNumbers: [] }, terrace.body]);
});
