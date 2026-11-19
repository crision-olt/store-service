const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');

test('creates and edits fixed bundles without partially saving an invalid selection', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ['products.sql', 'offers.sql', 'offers.sql']) {
    await db.exec(await readFile(join(__dirname, '../sql', file), 'utf8'));
  }
  await db.exec(`
    INSERT INTO categories (name) VALUES ('Food');
    INSERT INTO products (name, sku, category_id, price, archived_at)
    VALUES ('Main', 'MAIN', 1, 10, NULL), ('Drink', 'DRINK', 1, 4, NULL),
           ('Old', 'OLD', 1, 3, CURRENT_TIMESTAMP);
  `);
  t.mock.method(pool, 'query', db.query.bind(db));
  t.mock.method(pool, 'connect', async () => ({ query: db.query.bind(db), release() {} }));
  t.mock.method(User, 'isActive', async () => true);
  process.env.JWT_SECRET = 'test-secret';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/offers`;
  const call = async (method, path = '', body) => {
    const response = await fetch(url + path, {
      method,
      headers: { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await fetch(url)).status, 401);
  const menu = { name: 'Lunch menu', nameEs: 'Menú del día', kind: 'menu', amount: 12.5, productIds: [1, 2] };
  const created = await call('POST', '', menu);
  assert.deepEqual(created, { status: 201, body: { id: 1, ...menu } });
  const { nameEs: _nameEs, ...englishOnly } = menu;
  assert.equal((await call('POST', '', englishOnly)).status, 400);
  assert.deepEqual((await call('GET')).body, [created.body]);
  const promo = { ...menu, name: 'Lunch deal', nameEs: 'Oferta de almuerzo', kind: 'promotion', amount: 10 };
  for (const override of [{ productIds: [1, 3] }, { productIds: [1, 99] }, { productIds: [1, 1] }, { amount: 101 }, { amount: 1.005 }]) {
    assert.equal((await call('PUT', '/1', { ...promo, ...override })).status, 400);
    assert.deepEqual((await call('GET')).body, [created.body]);
  }
  const updated = await call('PUT', '/1', { ...promo, productIds: [2] });
  assert.deepEqual(updated, { status: 200, body: { id: 1, ...promo, productIds: [2] } });
  assert.deepEqual((await call('GET')).body, [updated.body]);

  await db.exec(`
    INSERT INTO products (name, sku, category_id, price)
    SELECT 'Coffee ' || id, 'COFFEE-' || id, 1, 3 FROM generate_series(1, 6) AS id
  `);
  const threshold = { ...promo, productIds: [4, 5, 6, 7, 8, 9], minimumDistinctProducts: 4 };
  const createdThreshold = await call('POST', '', threshold);
  assert.deepEqual(createdThreshold, { status: 201, body: { id: 2, ...threshold } });
  for (const fields of [
    { minimumDistinctProducts: 7 }, { minimumDistinctProducts: 0 },
    { minimumDistinctProducts: 4.5 }, { kind: 'menu' }, { productIds: [4, 5, 6] },
  ]) {
    assert.equal((await call('PUT', '/2', { ...threshold, ...fields })).status, 400);
    assert.deepEqual((await call('GET')).body, [createdThreshold.body, updated.body]);
  }
  const fixedAgain = await call('PUT', '/2', { ...promo, productIds: [4, 5, 6, 7, 8, 9], minimumDistinctProducts: null });
  assert.deepEqual(fixedAgain.body, { id: 2, ...promo, productIds: [4, 5, 6, 7, 8, 9] });
});
