BEGIN;

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_es VARCHAR(100),
  kind TEXT NOT NULL CHECK (kind IN ('menu', 'promotion')),
  amount NUMERIC(10, 2) NOT NULL CHECK (
    (kind = 'menu' AND amount >= 0) OR (kind = 'promotion' AND amount > 0 AND amount <= 100)
  )
);

ALTER TABLE offers ADD COLUMN IF NOT EXISTS minimum_distinct_products SMALLINT
  CHECK (minimum_distinct_products IS NULL OR
    (kind = 'promotion' AND minimum_distinct_products BETWEEN 1 AND 100));

CREATE TABLE IF NOT EXISTS offer_products (
  offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  PRIMARY KEY (offer_id, product_id)
);

COMMIT;
