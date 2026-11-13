BEGIN;

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  UNIQUE (category_id, name),
  UNIQUE (id, category_id)
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(64) UNIQUE NOT NULL,
  category_id INTEGER NOT NULL,
  subcategory_id INTEGER,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT products_subcategory_fk
    FOREIGN KEY (subcategory_id, category_id) REFERENCES subcategories(id, category_id)
);

CREATE INDEX idx_products_category_subcategory ON products(category_id, subcategory_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created_at ON products(created_at);

COMMIT;
