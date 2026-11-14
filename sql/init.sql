BEGIN;

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id),
  permission_id INTEGER NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO roles (name) VALUES ('admin');
INSERT INTO permissions (name) VALUES
  ('products:read'),
  ('products:create'),
  ('products:edit'),
  ('products:delete'),
  ('categories:read'),
  ('categories:create'),
  ('categories:edit'),
  ('categories:delete'),
  ('roles:read'),
  ('roles:create'),
  ('roles:edit'),
  ('roles:delete'),
  ('users:read'),
  ('users:create'),
  ('users:edit'),
  ('users:delete');
INSERT INTO role_permissions (role_id, permission_id)
  SELECT roles.id, permissions.id FROM roles, permissions
  WHERE roles.name = 'admin';

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

COMMIT;
