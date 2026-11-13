# Auth Service

Centralized authentication microservice for SSO across multiple applications.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup PostgreSQL:**
   ```bash
   createdb auth_sso
   psql auth_sso < sql/init.sql
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

### Upgrading an existing product database

Back up the database before upgrading. Run `psql -v ON_ERROR_STOP=1 auth_sso -f sql/products.sql`
before deploying the updated service and frontend. The transaction creates categories and
subcategories from the existing product names, then replaces the text columns with foreign
keys. Subcategories with the same name under different categories remain distinct. The script
can also be rerun on an upgraded database. Product category filters and creation requests now
use IDs rather than names, so older API clients must be updated.

## Tests

```bash
npm test
```

Migration tests use an isolated in-memory PostgreSQL engine; they do not connect to
the configured database.
