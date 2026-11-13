const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const Product = require('../src/models/Product');
const router = require('../src/routes/products');

test('category endpoints validate requests and expose database results', async (t) => {
  process.env.JWT_SECRET = 'test-secret';
  const app = express();
  app.use(express.json(), cookieParser(), router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
  const request = (path, body) => fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Cookie: `token=${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const originals = { ...Product };
  for (const name of ['findCategories', 'findSubcategories', 'createCategory', 'createSubcategory', 'create']) {
    originals[name] = Product[name];
    t.after(() => { Product[name] = originals[name]; });
  }

  Product.createCategory = async (name) => ({ id: 1, name });
  let response = await request('/categories', { name: ' Kitchen ' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 1, name: 'Kitchen' });
  assert.equal((await request('/categories', { name: '   ' })).status, 400);

  Product.createCategory = async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); };
  assert.equal((await request('/categories', { name: 'Kitchen' })).status, 409);

  Product.findCategories = async () => [{ id: 1, name: 'Kitchen' }];
  response = await request('/categories');
  assert.deepEqual(await response.json(), [{ id: 1, name: 'Kitchen' }]);

  Product.createSubcategory = async (name, categoryId) => ({ id: 2, name, categoryId });
  response = await request('/subcategories', { name: ' Mugs ', categoryId: 1 });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 2, name: 'Mugs', categoryId: 1 });
  assert.equal((await request('/subcategories', { name: 'Mugs', categoryId: '1' })).status, 400);

  Product.createSubcategory = async () => { throw Object.assign(new Error('missing parent'), { code: '23503' }); };
  assert.equal((await request('/subcategories', { name: 'Mugs', categoryId: 42 })).status, 400);

  Product.findSubcategories = async (categoryId) => [{ id: 2, name: 'Mugs', categoryId }];
  response = await request('/subcategories?category=1');
  assert.deepEqual(await response.json(), [{ id: 2, name: 'Mugs', categoryId: 1 }]);
  assert.equal((await request('/subcategories?category=Kitchen')).status, 400);

  Product.create = async () => { throw Object.assign(new Error('invalid pair'), { code: '23503' }); };
  response = await request('/', { name: 'Mug', sku: 'MUG-1', categoryId: 1, subcategoryId: 2, price: 5 });
  assert.equal(response.status, 400);

  assert.equal((await fetch(url + '/categories')).status, 401);
});
