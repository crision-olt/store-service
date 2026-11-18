const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');

test('edits products through the API and leaves rejected updates unchanged', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const db = new PGlite();
  t.after(() => db.close());
  for (const file of ['init.sql', 'products.sql']) {
    await db.exec(await readFile(join(__dirname, '../sql', file), 'utf8'));
  }
  await db.exec(`
    INSERT INTO users (email, password, role_id) VALUES ('editor@example.com', 'x', 1);
    INSERT INTO categories (name) VALUES ('Kitchen'), ('Office');
    INSERT INTO subcategories (category_id, name) VALUES (1, 'Mugs'), (2, 'Pens');
  `);
  const databasePath = require.resolve('../src/config/database');
  require.cache[databasePath] = {
    id: databasePath, filename: databasePath, loaded: true,
    exports: {
      query: (sql, params) => typeof sql === 'string' ? db.query(sql, params) : db.query(sql.text, sql.values)
    }
  };
  t.after(() => { delete require.cache[databasePath]; });

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/products', require('../src/routes/products'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/products`;
  const call = async (method, path, body, authenticated = true) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated ? { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const original = {
    name: 'Mug', sku: 'MUG-1', description: 'Original', categoryId: 1,
    subcategoryId: 1, price: 9.99, stock: 5
  };
  const created = await call('POST', '', original);
  assert.equal(created.status, 201);
  const other = await call('POST', '', { ...original, name: 'Plate', sku: 'PLATE-1' });
  assert.equal(other.status, 201);
  const id = created.body.id;
  const input = {
    name: ' New pen ', sku: ' PEN-1 ', description: ' Updated ', categoryId: 2,
    subcategoryId: 2, price: 0, stock: 0
  };
  let response = await call('PUT', `/${id}`, input);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ...created.body, ...input, name: 'New pen', sku: 'PEN-1', description: 'Updated',
    categoryName: 'Office', subcategoryName: 'Pens'
  });
  assert.deepEqual((await call('GET', `/${id}`)).body, response.body);
  assert.deepEqual((await call('GET', `/${other.body.id}`)).body, other.body);

  const snapshot = () => db.query('SELECT * FROM products ORDER BY id');
  const before = await snapshot();
  for (const [path, body, status] of [
    [`/${id}`, { ...input, sku: 'PLATE-1' }, 409],
    [`/${id}`, { ...input, subcategoryId: 1 }, 400],
    [`/${id}`, { ...input, categoryId: 999, subcategoryId: null }, 400],
    [`/${id}`, { ...input, name: ' ' }, 400],
    [`/${id}`, { ...input, price: 1.001 }, 400],
    [`/${id}`, { ...input, stock: -1 }, 400],
    ['/0', input, 400],
    ['/abc', input, 400],
    ['/2147483648', input, 400],
    ['/999', input, 404]
  ]) {
    response = await call('PUT', path, body);
    assert.equal(response.status, status, `PUT ${path}: ${JSON.stringify(body)}`);
    assert.equal(typeof response.body.error, 'string');
    assert.deepEqual(await snapshot(), before);
  }
  assert.equal((await call('PUT', `/${id}`, input, false)).status, 401);
  assert.deepEqual(await snapshot(), before);

  response = await call('PUT', `/${id}`, { ...input, subcategoryId: null, description: '' });
  assert.equal(response.status, 200);
  assert.equal(response.body.subcategoryId, null);
  assert.equal(response.body.subcategoryName, null);
  assert.equal(response.body.description, null);
  assert.equal(response.body.created_at, created.body.created_at);
  const list = await call('GET', '?search=pen');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data, [response.body]);

  await t.test('archives products without deleting their data and rejects invalid requests without changes', async () => {
    const beforeArchive = await snapshot();
    const visibleProduct = (await call('GET', `/${id}`)).body;
    for (const [path, status, authenticated] of [
      ['/0/archive', 400, true],
      ['/abc/archive', 400, true],
      ['/2147483648/archive', 400, true],
      ['/999/archive', 404, true],
      [`/${id}/archive`, 401, false]
    ]) {
      const rejected = await call('POST', path, undefined, authenticated);
      assert.equal(rejected.status, status);
      assert.equal(typeof rejected.body.error, 'string');
      assert.deepEqual(await snapshot(), beforeArchive);
    }

    const archived = await call('POST', `/${id}/archive`);
    assert.deepEqual(archived, { status: 204, body: null });
    const afterArchive = await snapshot();
    const archivedRow = afterArchive.rows.find((row) => row.id === id);
    assert.ok(archivedRow.archived_at);
    assert.deepEqual(afterArchive.rows, beforeArchive.rows.map((row) =>
      row.id === id ? { ...row, archived_at: archivedRow.archived_at } : row
    ));
    assert.equal((await call('GET', `/${id}`)).status, 404);
    assert.equal((await call('PUT', `/${id}`, original)).status, 404);
    assert.equal((await call('POST', `/${id}/archive`)).status, 204);
    assert.deepEqual(await snapshot(), afterArchive);
    const remaining = await call('GET', '');
    assert.equal(remaining.body.total, 1);
    assert.deepEqual(remaining.body.data, [other.body]);
    for (const query of ['?search=pen', '?category=2', '?subcategory=2', '?maxPrice=0&inStock=false']) {
      const filtered = await call('GET', query);
      assert.equal(filtered.status, 200);
      assert.equal(filtered.body.total, 0);
      assert.deepEqual(filtered.body.data, []);
    }

    await db.query('UPDATE products SET archived_at = NULL WHERE id = $1', [id]);
    assert.deepEqual((await call('GET', `/${id}`)).body, visibleProduct);
    assert.equal((await call('GET', '')).body.total, 2);
  });
});
