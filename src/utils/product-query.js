const SORTABLE_COLUMNS = ['id', 'name', 'sku', 'category', 'subcategory', 'price', 'stock', 'created_at'];
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PRICE = 99999999.99;
const MAX_ID = 2147483647;
const PRODUCT_COLUMNS = `id, name, description, sku,
  category_id AS "categoryId",
  (SELECT name FROM categories WHERE id = products.category_id) AS "categoryName",
  subcategory_id AS "subcategoryId",
  (SELECT name FROM subcategories WHERE id = products.subcategory_id) AS "subcategoryName",
  price, stock, created_at`;

const LIST_PARAMS = [
  'search', 'category', 'subcategory', 'minPrice', 'maxPrice', 'inStock', 'sortBy', 'sortOrder', 'page', 'pageSize'
];

const first = (value) => (Array.isArray(value) ? value[0] : value);

const parseNumber = (raw, name) => {
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value) || value < 0) {
    return { error: `${name} must be a non-negative number` };
  }
  return { value };
};

const parseInteger = (raw, name, { min, max }) => {
  const value = Number(raw);
  if (raw === '' || !Number.isInteger(value) || value < min || value > max) {
    return { error: `${name} must be an integer between ${min} and ${max}` };
  }
  return { value };
};

const escapeLike = (term) => term.replace(/[\\%_]/g, '\\$&');

// Parses and validates GET /products query params. Returns { filters } or { error }.
const parseListQuery = (query = {}) => {
  const filters = {
    search: undefined,
    category: undefined,
    subcategory: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    inStock: undefined,
    sortBy: 'created_at',
    sortOrder: 'desc',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };

  // Express parses `a[b]=c` into objects; every supported param must be a plain string.
  for (const name of LIST_PARAMS) {
    const raw = first(query[name]);
    if (raw !== undefined && typeof raw !== 'string') {
      return { error: `${name} must be a string` };
    }
  }

  const search = first(query.search);
  if (search !== undefined && search.trim() !== '') {
    if (search.length > 100) return { error: 'search must be at most 100 characters' };
    filters.search = search.trim();
  }

  for (const name of ['category', 'subcategory']) {
    const raw = first(query[name]);
    if (raw === undefined || raw === '') continue;
    if (!/^[1-9]\d*$/.test(raw)) return { error: `${name} must be a positive integer ID` };
    const parsed = parseInteger(raw, name, { min: 1, max: MAX_ID });
    if (parsed.error) return { error: parsed.error };
    filters[name] = parsed.value;
  }

  for (const name of ['minPrice', 'maxPrice']) {
    const raw = first(query[name]);
    if (raw === undefined || raw === '') continue;
    const parsed = parseNumber(raw, name);
    if (parsed.error) return { error: parsed.error };
    filters[name] = parsed.value;
  }
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    return { error: 'minPrice cannot be greater than maxPrice' };
  }

  const inStock = first(query.inStock);
  if (inStock !== undefined && inStock !== '') {
    if (inStock !== 'true' && inStock !== 'false') {
      return { error: 'inStock must be "true" or "false"' };
    }
    filters.inStock = inStock === 'true';
  }

  const sortBy = first(query.sortBy);
  if (sortBy !== undefined && sortBy !== '') {
    if (!SORTABLE_COLUMNS.includes(sortBy)) {
      return { error: `sortBy must be one of: ${SORTABLE_COLUMNS.join(', ')}` };
    }
    filters.sortBy = sortBy;
  }

  const sortOrder = first(query.sortOrder);
  if (sortOrder !== undefined && sortOrder !== '') {
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return { error: 'sortOrder must be "asc" or "desc"' };
    }
    filters.sortOrder = sortOrder;
  }

  const page = first(query.page);
  if (page !== undefined && page !== '') {
    const parsed = parseInteger(page, 'page', { min: 1, max: Number.MAX_SAFE_INTEGER });
    if (parsed.error) return { error: parsed.error };
    filters.page = parsed.value;
  }

  const pageSize = first(query.pageSize);
  if (pageSize !== undefined && pageSize !== '') {
    const parsed = parseInteger(pageSize, 'pageSize', { min: 1, max: MAX_PAGE_SIZE });
    if (parsed.error) return { error: parsed.error };
    filters.pageSize = parsed.value;
  }

  return { filters };
};

// Builds parameterized SQL. Column names come from the SORTABLE_COLUMNS whitelist only.
const buildListQuery = (filters) => {
  const conditions = [];
  const values = [];
  const param = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.search) {
    const placeholder = param(`%${escapeLike(filters.search)}%`);
    conditions.push(
      `(name ILIKE ${placeholder} OR sku ILIKE ${placeholder} OR description ILIKE ${placeholder})`
    );
  }
  if (filters.category) conditions.push(`category_id = ${param(filters.category)}`);
  if (filters.subcategory) conditions.push(`subcategory_id = ${param(filters.subcategory)}`);
  if (filters.minPrice !== undefined) conditions.push(`price >= ${param(filters.minPrice)}`);
  if (filters.maxPrice !== undefined) conditions.push(`price <= ${param(filters.maxPrice)}`);
  if (filters.inStock === true) conditions.push('stock > 0');
  if (filters.inStock === false) conditions.push('stock = 0');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const direction = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const sortColumn = filters.sortBy === 'category'
    ? '(SELECT name FROM categories WHERE id = products.category_id)'
    : filters.sortBy === 'subcategory'
      ? '(SELECT name FROM subcategories WHERE id = products.subcategory_id)'
      : SORTABLE_COLUMNS.includes(filters.sortBy) ? filters.sortBy : 'created_at';

  const countValues = [...values];
  const limit = param(filters.pageSize);
  const offset = param((filters.page - 1) * filters.pageSize);

  return {
    count: { text: `SELECT COUNT(*)::int AS total FROM products ${where}`, values: countValues },
    rows: {
      text:
        `SELECT ${PRODUCT_COLUMNS} FROM products ${where} ` +
        `ORDER BY ${sortColumn} ${direction}, id ${direction} LIMIT ${limit} OFFSET ${offset}`,
      values
    }
  };
};

// Validates a POST /products body. Returns { product } or { error }.
const parseProductInput = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const requiredText = (field, maxLength) => {
    const raw = body[field];
    if (typeof raw !== 'string' || raw.trim() === '') return { error: `${field} is required` };
    if (raw.trim().length > maxLength) {
      return { error: `${field} must be at most ${maxLength} characters` };
    }
    return { value: raw.trim() };
  };

  const product = {};
  for (const [field, maxLength] of [['name', 255], ['sku', 64]]) {
    const result = requiredText(field, maxLength);
    if (result.error) return { error: result.error };
    product[field] = result.value;
  }

  for (const field of ['categoryId', 'subcategoryId']) {
    const value = body[field];
    if (field === 'subcategoryId' && (value === undefined || value === null)) {
      product[field] = null;
    } else if (!Number.isInteger(value) || value < 1 || value > MAX_ID) {
      return { error: `${field} must be a positive integer ID` };
    } else {
      product[field] = value;
    }
  }

  const { description } = body;
  if (description === undefined || description === null || description === '') {
    product.description = null;
  } else if (typeof description !== 'string' || description.length > 2000) {
    return { error: 'description must be a string of at most 2000 characters' };
  } else {
    product.description = description.trim();
  }

  const { price } = body;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return { error: `price must be a number between 0 and ${MAX_PRICE}` };
  }
  if (Math.round(price * 100) / 100 !== price) {
    return { error: 'price must have at most 2 decimal places' };
  }
  product.price = price;

  const stock = body.stock === undefined ? 0 : body.stock;
  if (!Number.isInteger(stock) || stock < 0 || stock > 2147483647) {
    return { error: 'stock must be a non-negative integer' };
  }
  product.stock = stock;

  return { product };
};

module.exports = {
  SORTABLE_COLUMNS,
  PRODUCT_COLUMNS,
  parseListQuery,
  buildListQuery,
  parseProductInput
};
