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
has the `access:manage` permission.

To bootstrap administration, a database administrator must assign the `admin` role to
a trusted registered account using a controlled database connection. For example:

```sql
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE email = 'trusted-admin@example.com';
```

The following endpoints require a valid JWT cookie and the `access:manage` permission.
Permissions are checked from the database on each request; assigning a permission does
not automatically protect other endpoints.

- `POST /permissions` - Create a permission with `{ "name": "products:read" }`; returns `{ id, name }`.
- `GET /permissions` - List permissions as `{ id, name }` objects.
- `POST /roles` - Create a role with `{ "name": "reader", "permissionIds": [2, 3] }`.
  The IDs must exist and be distinct; an empty array creates a role without permissions.
  Returns `{ id, name, permissions }`, where `permissions` contains `{ id, name }` objects.
- `GET /roles` - List roles and their permissions.

Duplicate names return `409`; invalid input or nonexistent permission IDs return `400`.
An unauthenticated request returns `401`, and a user without `access:manage` receives
`403`. Look up permission IDs before assigning them: `access:manage` grants control
over these endpoints. There is no API for changing a user's role.

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
