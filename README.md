# Auth Service

Centralized authentication microservice for SSO across multiple applications.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup PostgreSQL:**
   Run these scripts once on a new database.
   ```bash
   createdb auth_sso
   psql -v ON_ERROR_STOP=1 auth_sso -f sql/init.sql
   psql -v ON_ERROR_STOP=1 auth_sso -f sql/products.sql
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL connection string and JWT_SECRET
   ```

4. **Start service:**
   ```bash
   npm start
   ```

Service will run on http://localhost:3000

## API Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user (requires valid JWT cookie)
- `POST /auth/logout` - Logout user

### Roles and permissions

Each user has exactly one role. Registration always assigns the seeded `user` role,
which has no permissions; request bodies cannot select a role. The seeded `admin` role
has every seeded permission: `read`, `create`, `edit` and `delete` for `products`,
`categories`, `roles` and `users` (for example `products:read`). They are seed data
only; no endpoint checks them.

To bootstrap administration (the first admin; later changes go through `PUT /users/:id`), a database administrator must assign the `admin` role to
a trusted registered account using a controlled database connection. For example:

```sql
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE email = 'trusted-admin@example.com';
```

The following endpoints require a valid JWT cookie. No role or permission is checked:
any authenticated user can call them.

- `POST /permissions` - Create a permission with `{ "name": "products:read" }`; returns `{ id, name }`.
- `GET /permissions` - List permissions as `{ id, name }` objects.
- `POST /roles` - Create a role with `{ "name": "reader", "permissionIds": [2, 3] }`.
  The IDs must exist and be distinct; an empty array creates a role without permissions.
  Returns `{ id, name, permissions }`, where `permissions` contains `{ id, name }` objects.
- `GET /roles` - List roles and their permissions.
- `PUT /permissions/:id` - Rename a permission with `{ "name": "products:edit" }`.
- `DELETE /permissions/:id` - Delete a permission that no role uses (`204`).
- `PUT /roles/:id` - Replace a role's name and permissions with `{ "name", "permissionIds" }`.
- `DELETE /roles/:id` - Delete a role that no user has (`204`).
- `GET /users` - List users as `{ id, email, created_at, role: { id, name } }`.
- `POST /users` - Create a user with `{ "email", "password", "roleId" }` (password 8 to 72 characters).
- `PUT /users/:id` - Update a user with `{ "email", "roleId", "password" }`; omit `password` to keep the current one.

Protection (returns `409`): the `user` role (used by registration) cannot be renamed
or deleted. Unknown IDs return `404`.

Duplicate names return `409`; invalid input or nonexistent permission or role IDs return `400`.
An unauthenticated request returns `401`. Look up permission IDs before assigning them.

### Products (all require a valid JWT cookie)

- `POST /products` - Create a product. JSON body: `name`, `sku` (unique), `categoryId`, `price` (max 2 decimals), optional `subcategoryId`, `description` and `stock` (default `0`). IDs must be positive integers, and the subcategory must belong to the category. Returns `400` for invalid references and `409` if the SKU exists.
- `GET /products` - List products. Response: `{ data, total, page, pageSize }`. Query params (all optional):
  - `search` - case-insensitive match on name, SKU or description
  - `category` - exact category ID
  - `subcategory` - exact subcategory ID
  - `minPrice`, `maxPrice` - price range (inclusive)
  - `inStock` - `true` (stock > 0) or `false` (stock = 0)
  - `sortBy` - `id`, `name`, `sku`, `category`, `subcategory`, `price`, `stock` or `created_at` (default `created_at`)
  - `sortOrder` - `asc` or `desc` (default `desc`)
  - `page` (default `1`), `pageSize` (default `10`, max `100`)
- Products include `categoryId`, `categoryName`, `subcategoryId` and `subcategoryName`; subcategory fields may be `null`.
- `GET /products/categories` - List `{ id, name }` categories, including those without products.
- `POST /products/categories` - Create a category with `{ "name": "Kitchen" }`.
- `GET /products/subcategories` - List `{ id, name, categoryId }` subcategories, optionally limited by `?category=<id>`.
- `POST /products/subcategories` - Create a subcategory with `{ "name": "Mugs", "categoryId": 1 }`.
- Creating duplicate category names, or duplicate subcategory names within the same category, returns `409`. A nonexistent parent category returns `400`.
- `GET /products/:id` - Get a product by id (`404` if missing)

## Tests

```bash
npm test
```

Schema tests use an isolated in-memory PostgreSQL engine; they do not connect to
the configured database.
