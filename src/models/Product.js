const pool = require('../config/database');
const { buildListQuery, PRODUCT_COLUMNS } = require('../utils/product-query');

// NUMERIC columns come back from pg as strings; the API exposes price as a number.
const toProduct = (row) => (row ? { ...row, price: Number(row.price) } : row);

class Product {
  static async create({ name, description, sku, categoryId, subcategoryId, price, stock }) {
    const result = await pool.query(
      `WITH products AS (
        INSERT INTO products (name, description, sku, category_id, subcategory_id, price, stock)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
      ) SELECT ${PRODUCT_COLUMNS} FROM products`,
      [name, description, sku, categoryId, subcategoryId, price, stock]
    );
    return toProduct(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [id]);
    return toProduct(result.rows[0]);
  }

  static async findAll(filters) {
    const query = buildListQuery(filters);
    const [rows, count] = await Promise.all([
      pool.query(query.rows),
      pool.query(query.count)
    ]);
    return {
      data: rows.rows.map(toProduct),
      total: count.rows[0].total,
      page: filters.page,
      pageSize: filters.pageSize
    };
  }

  static async findSubcategories(categoryId) {
    const result = categoryId
      ? await pool.query(
          'SELECT id, name, category_id AS "categoryId" FROM subcategories WHERE category_id = $1 ORDER BY name, id',
          [categoryId]
        )
      : await pool.query(
          'SELECT id, name, category_id AS "categoryId" FROM subcategories ORDER BY name, id'
        );
    return result.rows;
  }

  static async findCategories() {
    const result = await pool.query('SELECT id, name FROM categories ORDER BY name, id');
    return result.rows;
  }

  static async createCategory(name) {
    const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id, name', [name]);
    return result.rows[0];
  }

  static async createSubcategory(name, categoryId) {
    const result = await pool.query(
      'INSERT INTO subcategories (name, category_id) VALUES ($1, $2) RETURNING id, name, category_id AS "categoryId"',
      [name, categoryId]
    );
    return result.rows[0];
  }
}

module.exports = Product;
