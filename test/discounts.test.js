const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');

test('creates invoice-wide discounts and persists their eligible roles', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(join(__dirname, '../sql/init.sql'), 'utf8'));
  const discountsSql = await readFile(join(__dirname, '../sql/discounts.sql'), 'utf8');
  await db.exec(discountsSql);
  await db.exec(discountsSql);
  await db.query("INSERT INTO roles (name) VALUES ('member')");
  t.mock.method(pool, 'query', db.query.bind(db));
  t.mock.method(pool, 'connect', async () => ({ query: db.query.bind(db), release() {} }));
  t.mock.method(User, 'isActive', async () => true);
  process.env.JWT_SECRET = 'test-secret';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/discounts`;
  const call = async (method, path = '', body) => {
    const response = await fetch(url + path, {
      method,
      headers: { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const responseBody = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();
    return { status: response.status, body: responseBody };
  };
  const percentage = {
    name: 'Loyalty discount', nameEs: 'Descuento de fidelidad',
    kind: 'percentage', amount: 10, roleIds: [2],
  };
  const created = await call('POST', '', percentage);
  assert.deepEqual(created, { status: 201, body: { id: 1, ...percentage } });
  assert.deepEqual((await call('GET')).body, [created.body]);

  for (const override of [
    { roleIds: [] }, { roleIds: [999] }, { roleIds: [2, 2] },
    { amount: 100.01 }, { amount: 1.005 }, { kind: 'unknown' },
  ]) {
    assert.equal((await call('PUT', '/1', { ...percentage, ...override })).status, 400);
    assert.deepEqual((await call('GET')).body, [created.body]);
  }

  const fixed = {
    ...percentage, name: 'Invoice credit', nameEs: 'Crédito en factura',
    kind: 'fixed_amount', amount: 5, roleIds: [1, 2],
  };
  const updated = await call('PUT', '/1', fixed);
  assert.deepEqual(updated, { status: 200, body: { id: 1, ...fixed } });
  assert.deepEqual((await call('GET')).body, [updated.body]);
  await db.query('DELETE FROM roles WHERE id = $1', [2]);
  assert.deepEqual((await call('GET')).body, [{ ...updated.body, roleIds: [1] }]);
});
