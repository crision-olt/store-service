const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');

test('configures consecutively numbered tables and preserves their settings on resize', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const sql = await readFile(join(__dirname, '../sql/tables.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  t.mock.method(pool, 'query', db.query.bind(db));
  t.mock.method(pool, 'connect', async () => ({ query: db.query.bind(db), release() {} }));
  t.mock.method(User, 'isActive', async () => true);
  process.env.JWT_SECRET = 'test-secret';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/tables`;
  const call = async (method, path = '', body) => {
    const response = await fetch(url + path, {
      method,
      headers: { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const defaults = (number) => ({ number, capacity: 2, isOutside: false, isAccessible: false });
  assert.deepEqual(await call('PUT', '', { count: 3, expectedCount: 0 }), { status: 200, body: [defaults(1), defaults(2), defaults(3)] });
  const changed = { number: 2, capacity: 8, isOutside: true, isAccessible: true };
  assert.deepEqual(await call('PUT', '/2', changed), { status: 200, body: changed });
  assert.equal((await call('PUT', '', { count: 1, expectedCount: 0 })).status, 409);
  assert.deepEqual((await call('GET')).body, [defaults(1), changed, defaults(3)]);
  assert.deepEqual((await call('PUT', '', { count: 4, expectedCount: 3 })).body, [defaults(1), changed, defaults(3), defaults(4)]);
  assert.deepEqual((await call('PUT', '', { count: 2, expectedCount: 4 })).body, [defaults(1), changed]);
  assert.deepEqual((await call('GET')).body, [defaults(1), changed]);
  for (const capacity of [0, 3, 10, '2']) {
    assert.equal((await call('PUT', '/2', { ...changed, capacity })).status, 400);
  }
  for (const count of [0, -1, 1.5, 51, '2']) assert.equal((await call('PUT', '', { count, expectedCount: 2 })).status, 400);
  assert.equal((await call('PUT', '/3', changed)).status, 404);
  assert.deepEqual((await call('GET')).body, [defaults(1), changed]);
});
