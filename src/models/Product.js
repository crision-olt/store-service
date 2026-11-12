const pool = require('../config/database');
const { buildListQuery } = require('../utils/product-query');

const COLUMNS = 'id, name, description, sku, category, subcategory, price, stock, created_at';

// NUMERIC columns come back from pg as strings; the API exposes price as a number.
const toProduct = (row) => (row ? { ...row, price: Number(row.price) } : row);

class Product {
  static async create({ name, description, sku, category, subcategory, price, stock }) {
    const result = await pool.query(
      `INSERT INTO products (name, description, sku, category, subcategory, price, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [name, description, sku, category, subcategory, price, stock]
    );
    return toProduct(result.rows[0]);
  }

  static async findById(id) {
    const result = await pool.query(`SELECT ${COLUMNS} FROM products WHERE id = $1`, [id]);
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

  static async findSubcategories(category) {
    const result = category
      ? await pool.query(
          'SELECT DISTINCT subcategory FROM products WHERE subcategory IS NOT NULL AND category = $1 ORDER BY subcategory',
          [category]
        )
      : await pool.query(
          'SELECT DISTINCT subcategory FROM products WHERE subcategory IS NOT NULL ORDER BY subcategory'
        );
    return result.rows.map((row) => row.subcategory);
  }

  static async findCategories() {
    const result = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
    return result.rows.map((row) => row.category);
  }
}

module.exports = Product;
