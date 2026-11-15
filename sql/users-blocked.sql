-- For databases created before user blocking existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP;
