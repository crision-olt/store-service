const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('creates the product schema with category and subcategory relationships', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(join(__dirname, '../sql/products.sql'), 'utf8'));
  const { rows: columns } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'products'"
  );
  assert.ok(!columns.some(({ column_name }) => column_name === 'stock'));

  await db.exec(`
    INSERT INTO categories (name) VALUES ('Kitchen'), ('Office');
    INSERT INTO subcategories (category_id, name) VALUES (1, 'Mugs'), (2, 'Mugs');
    INSERT INTO products (name, sku, category_id, subcategory_id, price)
    VALUES ('Mug', 'K-1', 1, 1, 9.99), ('Plate', 'K-2', 1, NULL, 3);
  `);
  const { rows } = await db.query(`
    SELECT p.name, c.name AS category, s.name AS subcategory
    FROM products p JOIN categories c ON c.id = p.category_id
    LEFT JOIN subcategories s ON s.id = p.subcategory_id
    ORDER BY p.id
  `);
  assert.deepEqual(rows, [
    { name: 'Mug', category: 'Kitchen', subcategory: 'Mugs' },
    { name: 'Plate', category: 'Kitchen', subcategory: null }
  ]);
  await assert.rejects(
    db.query(
      'INSERT INTO products (name, sku, category_id, subcategory_id, price) VALUES ($1, $2, $3, $4, $5)',
      ['Invalid', 'INVALID', 1, 2, 1]
    ),
    { code: '23503' }
  );
  await assert.rejects(
    db.query('INSERT INTO subcategories (category_id, name) VALUES ($1, $2)', [1, 'Mugs']),
    { code: '23505' }
  );

  await t.test('migrates existing products without altering data and can be run again', async () => {
    await db.exec('ALTER TABLE products DROP COLUMN IF EXISTS archived_at');
    const before = await db.query('SELECT * FROM products ORDER BY id');
    const migration = await readFile(join(__dirname, '../sql/products-archived.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const after = await db.query('SELECT * FROM products ORDER BY id');
    assert.deepEqual(after.rows, before.rows.map((row) => ({ ...row, archived_at: null })));
  });

  await t.test('drops legacy stock values without changing other product data and can be run again', async () => {
    const before = await db.query('SELECT * FROM products ORDER BY id');
    await db.exec(`
      ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);
      UPDATE products SET stock = 12 WHERE sku = 'K-1';
    `);
    const migration = await readFile(join(__dirname, '../sql/products-remove-stock.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const after = await db.query('SELECT * FROM products ORDER BY id');
    assert.deepEqual(after.rows, before.rows);
  });
});
