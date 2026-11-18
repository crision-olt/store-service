const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/database');
const User = require('../src/models/User');

test('authenticated clients can read the fourteen seeded EU allergen categories', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const seed = await readFile(join(__dirname, '../sql/allergens.sql'), 'utf8');
  await db.exec(seed);
  await db.exec(seed);

  t.mock.method(pool, 'query', (sql) => db.query(sql));
  t.mock.method(User, 'isActive', async () => true);
  process.env.JWT_SECRET = 'test-secret';
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/allergens`;
  const headers = { Cookie: `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` };

  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.deepEqual(rows.map(({ code }) => code), [
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
    'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
  ]);
  assert.equal(rows[0].name, 'Cereals containing gluten');
  assert.equal(rows[0].nameEs, 'Cereales que contienen gluten');
  assert.equal((await fetch(url, { method: 'POST', headers })).status, 404);
});
