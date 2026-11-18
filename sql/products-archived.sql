-- For databases created before product archiving existed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
