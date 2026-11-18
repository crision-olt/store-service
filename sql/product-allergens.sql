CREATE TABLE IF NOT EXISTS product_allergens (
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  allergen_id SMALLINT,
  PRIMARY KEY (product_id, allergen_id),
  CONSTRAINT product_allergens_catalog_fk FOREIGN KEY (allergen_id) REFERENCES allergens(id)
);
