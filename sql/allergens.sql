CREATE TABLE IF NOT EXISTS allergens (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_es TEXT NOT NULL
);

INSERT INTO allergens (id, code, name, name_es) VALUES
  (1, 'gluten', 'Cereals containing gluten', 'Cereales que contienen gluten'),
  (2, 'crustaceans', 'Crustaceans', 'Crustáceos'),
  (3, 'eggs', 'Eggs', 'Huevos'),
  (4, 'fish', 'Fish', 'Pescado'),
  (5, 'peanuts', 'Peanuts', 'Cacahuetes'),
  (6, 'soybeans', 'Soybeans', 'Soja'),
  (7, 'milk', 'Milk', 'Leche'),
  (8, 'nuts', 'Tree nuts', 'Frutos de cáscara'),
  (9, 'celery', 'Celery', 'Apio'),
  (10, 'mustard', 'Mustard', 'Mostaza'),
  (11, 'sesame', 'Sesame seeds', 'Granos de sésamo'),
  (12, 'sulphites', 'Sulphur dioxide and sulphites', 'Dióxido de azufre y sulfitos'),
  (13, 'lupin', 'Lupin', 'Altramuces'),
  (14, 'molluscs', 'Molluscs', 'Moluscos')
ON CONFLICT (id) DO NOTHING;
