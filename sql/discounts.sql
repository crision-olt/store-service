BEGIN;

CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_es VARCHAR(100) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percentage', 'fixed_amount')),
  amount NUMERIC(10, 2) NOT NULL CHECK (
    (kind = 'percentage' AND amount > 0 AND amount <= 100) OR
    (kind = 'fixed_amount' AND amount > 0)
  )
);

CREATE TABLE IF NOT EXISTS discount_roles (
  discount_id INTEGER NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, role_id)
);

COMMIT;
