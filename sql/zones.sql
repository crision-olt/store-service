BEGIN;

CREATE TABLE IF NOT EXISTS restaurant_zones (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
  has_outside BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id, has_outside)
);

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES restaurant_zones (id),
  ADD COLUMN IF NOT EXISTS outdoor_zone_id INTEGER GENERATED ALWAYS AS
    (CASE WHEN is_outside THEN zone_id END) STORED,
  ADD COLUMN IF NOT EXISTS requires_outdoor_zone BOOLEAN GENERATED ALWAYS AS (TRUE) STORED;

-- Only assigned outdoor tables require a zone whose outdoor flag is true.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'restaurant_tables'::regclass
      AND conname = 'restaurant_tables_outdoor_zone_fkey'
  ) THEN
    ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_outdoor_zone_fkey
      FOREIGN KEY (outdoor_zone_id, requires_outdoor_zone) REFERENCES restaurant_zones (id, has_outside);
  END IF;
END $$;

COMMIT;
