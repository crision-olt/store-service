-- Run this script as a transaction so an unsuccessful upgrade leaves products unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  UNIQUE (category_id, name),
  UNIQUE (id, category_id)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(64) UNIQUE NOT NULL,
  category_id INTEGER NOT NULL,
  subcategory_id INTEGER,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

LOCK TABLE products IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'category'
  ) THEN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
    ALTER TABLE products ADD COLUMN category_id INTEGER;
    ALTER TABLE products ADD COLUMN subcategory_id INTEGER;

    INSERT INTO categories (name)
      SELECT DISTINCT category FROM products
      ON CONFLICT (name) DO NOTHING;
    INSERT INTO subcategories (category_id, name)
      SELECT DISTINCT c.id, p.subcategory
      FROM products p JOIN categories c ON c.name = p.category
      WHERE p.subcategory IS NOT NULL
      ON CONFLICT (category_id, name) DO NOTHING;

    UPDATE products p SET category_id = c.id
      FROM categories c WHERE c.name = p.category;
    UPDATE products p SET subcategory_id = s.id
      FROM subcategories s WHERE s.category_id = p.category_id AND s.name = p.subcategory;

    ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
    ALTER TABLE products DROP COLUMN category;
    ALTER TABLE products DROP COLUMN subcategory;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'products'::regclass AND conname = 'products_category_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_fk
      FOREIGN KEY (category_id) REFERENCES categories(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'products'::regclass AND conname = 'products_subcategory_fk') THEN
    ALTER TABLE products ADD CONSTRAINT products_subcategory_fk
      FOREIGN KEY (subcategory_id, category_id) REFERENCES subcategories(id, category_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category_subcategory ON products(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

COMMIT;
