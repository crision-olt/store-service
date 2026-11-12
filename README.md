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
   psql auth_sso < sql/products.sql
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

- `POST /products` - Create a product. JSON body: `name`, `sku` (unique), `category`, `price` (max 2 decimals), optional `subcategory`, `description` and `stock` (default `0`). Returns `409` if the SKU exists.
- `GET /products` - List products. Response: `{ data, total, page, pageSize }`. Query params (all optional):
  - `search` - case-insensitive match on name, SKU or description
  - `category` - exact category
  - `subcategory` - exact subcategory
  - `minPrice`, `maxPrice` - price range (inclusive)
  - `inStock` - `true` (stock > 0) or `false` (stock = 0)
  - `sortBy` - `id`, `name`, `sku`, `category`, `subcategory`, `price`, `stock` or `created_at` (default `created_at`)
  - `sortOrder` - `asc` or `desc` (default `desc`)
  - `page` (default `1`), `pageSize` (default `10`, max `100`)
- `GET /products/categories` - Distinct category names
- `GET /products/subcategories` - Distinct subcategory names, optionally limited with `?category=`
- `GET /products/:id` - Get a product by id (`404` if missing)

## Tests

```bash
npm test
```
