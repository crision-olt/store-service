const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('adds Spanish-name columns repeatably without changing existing names', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE categories (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
    CREATE TABLE subcategories (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
    CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL);
    CREATE TABLE offers (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
    INSERT INTO categories (name) VALUES ('Kitchen');
    INSERT INTO subcategories (name) VALUES ('Mugs');
    INSERT INTO products (name) VALUES ('Blue mug');
    INSERT INTO offers (name) VALUES ('Lunch menu');
  `);
  const migration = await readFile(join(__dirname, '../sql/bilingual-names.sql'), 'utf8');

  await db.exec(migration);
  await db.exec(migration);

  for (const [table, name] of [
    ['categories', 'Kitchen'],
    ['subcategories', 'Mugs'],
    ['products', 'Blue mug'],
    ['offers', 'Lunch menu'],
  ]) {
    const { rows } = await db.query(`SELECT name, name_es FROM ${table}`);
    assert.deepEqual(rows, [{ name, name_es: null }]);
  }
});
