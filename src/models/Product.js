const pool = require('../config/database');
const { buildListQuery, PRODUCT_COLUMNS } = require('../utils/product-query');

// NUMERIC columns come back from pg as strings; the API exposes price as a number.
const toProduct = (row) => (row ? { ...row, price: Number(row.price) } : row);

async function saveProduct(sql, params, allergenIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [saved] } = await client.query(sql, params);
    let product;
    if (saved) {
      if (allergenIds !== undefined) {
        await client.query('DELETE FROM product_allergens WHERE product_id = $1', [saved.id]);
        if (allergenIds.length > 0) {
          await client.query(
            'INSERT INTO product_allergens (product_id, allergen_id) SELECT $1, id FROM unnest($2::smallint[]) AS ids(id)',
            [saved.id, allergenIds]
          );
        }
      }
      const { rows } = await client.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [saved.id]);
      product = toProduct(rows[0]);
    }
    await client.query('COMMIT');
    return product;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

class Product {
  static async create({ name, nameEs, description, sku, categoryId, subcategoryId, price, allergenIds }) {
    return saveProduct(
      `INSERT INTO products (name, name_es, description, sku, category_id, subcategory_id, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, nameEs, description, sku, categoryId, subcategoryId, price],
      allergenIds
    );
  }

  static async findById(id) {
    const result = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 AND archived_at IS NULL`, [id]);
    return toProduct(result.rows[0]);
  }

  static async update(id, { name, nameEs, description, sku, categoryId, subcategoryId, price, allergenIds }) {
    return saveProduct(
      `UPDATE products
       SET name = $2, name_es = $3, description = $4, sku = $5, category_id = $6, subcategory_id = $7, price = $8
       WHERE id = $1 AND archived_at IS NULL RETURNING id`,
      [id, name, nameEs, description, sku, categoryId, subcategoryId, price],
      allergenIds
    );
  }

  static async archive(id) {
    const result = await pool.query(
      'UPDATE products SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP) WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
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
          'SELECT id, name, name_es AS "nameEs", category_id AS "categoryId" FROM subcategories WHERE category_id = $1 ORDER BY name, id',
          [categoryId]
        )
      : await pool.query(
          'SELECT id, name, name_es AS "nameEs", category_id AS "categoryId" FROM subcategories ORDER BY name, id'
        );
    return result.rows;
  }

  static async findCategories() {
    const result = await pool.query('SELECT id, name, name_es AS "nameEs" FROM categories ORDER BY name, id');
    return result.rows;
  }

  static async createCategory(name, nameEs) {
    const result = await pool.query(
      'INSERT INTO categories (name, name_es) VALUES ($1, $2) RETURNING id, name, name_es AS "nameEs"',
      [name, nameEs]
    );
    return result.rows[0];
  }

  static async updateCategory(id, name, nameEs) {
    const result = await pool.query(
      'UPDATE categories SET name = $2, name_es = $3 WHERE id = $1 RETURNING id, name, name_es AS "nameEs"',
      [id, name, nameEs]
    );
    return result.rows[0];
  }

  static async createSubcategory(name, nameEs, categoryId) {
    const result = await pool.query(
      'INSERT INTO subcategories (name, name_es, category_id) VALUES ($1, $2, $3) RETURNING id, name, name_es AS "nameEs", category_id AS "categoryId"',
      [name, nameEs, categoryId]
    );
    return result.rows[0];
  }

  static async updateSubcategory(id, name, nameEs) {
    const result = await pool.query(
      'UPDATE subcategories SET name = $2, name_es = $3 WHERE id = $1 RETURNING id, name, name_es AS "nameEs", category_id AS "categoryId"',
      [id, name, nameEs]
    );
    return result.rows[0];
  }
}

module.exports = Product;
