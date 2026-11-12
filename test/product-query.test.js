const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, buildListQuery, parseProductInput } = require('../src/utils/product-query');

const build = (query) => {
  const { filters, error } = parseListQuery(query);
  assert.equal(error, undefined);
  return buildListQuery(filters);
};

test('list query defaults to newest first, page 1 of 10', () => {
  const { rows, count } = build({});
  assert.match(rows.text, /ORDER BY created_at DESC, id DESC LIMIT \$1 OFFSET \$2$/);
  assert.deepEqual(rows.values, [10, 0]);
  assert.doesNotMatch(rows.text, /WHERE/);
  assert.deepEqual(count.values, []);
});

test('list query combines every filter with parameterized values', () => {
  const { rows, count } = build({
    search: '50%_off',
    category: 'Books',
    subcategory: 'Fiction',
    minPrice: '5',
    maxPrice: '20.5',
    inStock: 'true',
    sortBy: 'price',
    sortOrder: 'asc',
    page: '3',
    pageSize: '25'
  });
  assert.match(rows.text, /WHERE \(name ILIKE \$1 OR sku ILIKE \$1 OR description ILIKE \$1\)/);
  assert.match(
    rows.text,
    /category = \$2 AND subcategory = \$3 AND price >= \$4 AND price <= \$5 AND stock > 0/
  );
  assert.match(rows.text, /ORDER BY price ASC, id ASC LIMIT \$6 OFFSET \$7$/);
  assert.deepEqual(rows.values, ['%50\\%\\_off%', 'Books', 'Fiction', 5, 20.5, 25, 50]);
  assert.deepEqual(count.values, ['%50\\%\\_off%', 'Books', 'Fiction', 5, 20.5]);
});

test('inStock=false only matches products without stock', () => {
  assert.match(build({ inStock: 'false' }).rows.text, /stock = 0/);
});

test('list query rejects invalid input', () => {
  for (const query of [
    { sortBy: 'price; DROP TABLE products' },
    { sortOrder: 'sideways' },
    { minPrice: '-1' },
    { maxPrice: 'abc' },
    { minPrice: '10', maxPrice: '5' },
    { inStock: 'maybe' },
    { page: '0' },
    { pageSize: '101' },
    { pageSize: '1.5' },
    { search: { $ne: 'x' } }
  ]) {
    assert.ok(parseListQuery(query).error, JSON.stringify(query));
  }
});

test('product input is trimmed and defaults stock to 0', () => {
  const { product, error } = parseProductInput({
    name: '  Mug ',
    sku: 'MUG-1',
    category: 'Kitchen',
    price: 9.99
  });
  assert.equal(error, undefined);
  assert.deepEqual(product, {
    name: 'Mug',
    sku: 'MUG-1',
    category: 'Kitchen',
    subcategory: null,
    description: null,
    price: 9.99,
    stock: 0
  });
});

test('product input trims an optional subcategory', () => {
  const input = { name: 'Mug', sku: 'MUG-1', category: 'Kitchen', price: 9.99 };
  assert.equal(parseProductInput({ ...input, subcategory: ' Mugs ' }).product.subcategory, 'Mugs');
  assert.equal(parseProductInput({ ...input, subcategory: '' }).product.subcategory, null);
});

test('product input rejects invalid payloads', () => {
  const valid = { name: 'Mug', sku: 'MUG-1', category: 'Kitchen', price: 9.99, stock: 1 };
  for (const override of [
    { name: '' },
    { sku: undefined },
    { category: 5 },
    { subcategory: 5 },
    { subcategory: '   ' },
    { subcategory: 'x'.repeat(101) },
    { price: '9.99' },
    { price: -1 },
    { price: 1.005 },
    { stock: 1.5 },
    { stock: -1 },
    { description: 42 }
  ]) {
    assert.ok(parseProductInput({ ...valid, ...override }).error, JSON.stringify(override));
  }
  assert.ok(parseProductInput(null).error);
  assert.ok(parseProductInput([]).error);
});
