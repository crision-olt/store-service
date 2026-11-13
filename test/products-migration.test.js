const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = readFile(join(__dirname, '../sql/products.sql'), 'utf8');

test('sets up an empty database and upgrades products without a subcategory column', async (t) => {
  const fresh = new PGlite();
  const legacy = new PGlite();
  t.after(() => Promise.all([fresh.close(), legacy.close()]));
  await fresh.exec(await migration);
  await fresh.exec(await migration);
  await legacy.exec(`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL,
      category VARCHAR(100) NOT NULL, price NUMERIC NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO products (name, sku, category, price) VALUES ('Book', 'B-1', 'Books', 1);
  `);
  await legacy.exec(await migration);
  const { rows } = await legacy.query(`
    SELECT c.name, p.subcategory_id FROM products p JOIN categories c ON c.id = p.category_id
  `);
  assert.deepEqual(rows, [{ name: 'Books', subcategory_id: null }]);
});

test('migrates legacy product names without losing data and enforces category relationships', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT,
      sku VARCHAR(64) UNIQUE NOT NULL, category VARCHAR(100) NOT NULL,
      subcategory VARCHAR(100), price NUMERIC(10, 2) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO products (name, description, sku, category, subcategory, price, stock) VALUES
      ('Mug', 'A mug', 'K-1', 'Kitchen', 'Mugs', 9.99, 2),
      ('Pen holder', NULL, 'O-1', 'Office', 'Mugs', 5, 0),
      ('Plate', NULL, 'K-2', 'Kitchen', NULL, 3, 1);
  `);
  await db.exec(await migration);
  await db.exec(await migration);
  const { rows } = await db.query(`
    SELECT p.name, p.description, p.sku, p.price::text, p.stock,
           c.id AS category_id, c.name AS category,
           s.id AS subcategory_id, s.name AS subcategory
    FROM products p JOIN categories c ON c.id = p.category_id
    LEFT JOIN subcategories s ON s.id = p.subcategory_id
    ORDER BY p.id
  `);
  assert.deepEqual(rows.map(({ name, description, sku, price, stock, category, subcategory }) =>
    ({ name, description, sku, price, stock, category, subcategory })), [
    { name: 'Mug', description: 'A mug', sku: 'K-1', price: '9.99', stock: 2, category: 'Kitchen', subcategory: 'Mugs' },
    { name: 'Pen holder', description: null, sku: 'O-1', price: '5.00', stock: 0, category: 'Office', subcategory: 'Mugs' },
    { name: 'Plate', description: null, sku: 'K-2', price: '3.00', stock: 1, category: 'Kitchen', subcategory: null }
  ]);
  assert.notEqual(rows[0].subcategory_id, rows[1].subcategory_id);
  await assert.rejects(
    db.query(
      'INSERT INTO products (name, sku, category_id, subcategory_id, price) VALUES ($1, $2, $3, $4, $5)',
      ['Invalid', 'INVALID', rows[0].category_id, rows[1].subcategory_id, 1]
    ),
    { code: '23503' }
  );
});

test('rolls back a failed migration without changing legacy products', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL,
      category VARCHAR(100) NOT NULL, category_id TEXT, price NUMERIC NOT NULL
    );
    INSERT INTO products (name, sku, category, category_id, price)
    VALUES ('Item', 'SKU', 'Hardware', 'legacy', 1);
  `);
  await assert.rejects(db.exec(await migration));
  await db.exec('ROLLBACK');
  const { rows } = await db.query('SELECT category, category_id FROM products');
  assert.deepEqual(rows, [{ category: 'Hardware', category_id: 'legacy' }]);
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('categories', 'subcategories')");
  assert.deepEqual(tables.rows, []);
});
