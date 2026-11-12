CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(64) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Databases created before subcategories existed
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_products_category_subcategory ON products(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
