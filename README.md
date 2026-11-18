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

### Existing product databases

Before starting the updated service on a database created before product archiving,
run:

```bash
psql -v ON_ERROR_STOP=1 auth_sso -f sql/products-archived.sql
```

This adds nullable archive metadata, preserves existing product data, and is safe
to run again. New databases already include it in `sql/products.sql`.

After deploying the stock-free service, run this migration on existing databases:

```bash
psql -v ON_ERROR_STOP=1 auth_sso -f sql/products-remove-stock.sql
```

This permanently removes stored stock values without deleting products. Back up
the database first. New databases do not need this migration.

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
- `PUT /users/:id/block` - Block a user: closes their open sessions immediately and rejects their token and login (`403 Account blocked`). You cannot block yourself (`409`).
- `DELETE /users/:id/block` - Unblock a user.
- `GET /auth/events` - Server-sent events stream for the signed-in user. The server sends `event: blocked` and closes the stream when an administrator blocks the account; the frontend then signs the user out.

Every authenticated request checks the database, so a blocked or deleted user's token stops
working at once (`401`) even though the JWT itself has not expired. Databases created before
this feature need `sql/users-blocked.sql` (adds `users.blocked_at`). Open streams are kept in
memory, so instant sign-out works with one service instance; with several, the blocked user
is still rejected on their next request.

Protection (returns `409`): the `user` role (used by registration) cannot be renamed
or deleted. Unknown IDs return `404`.

Duplicate names return `409`; invalid input or nonexistent permission or role IDs return `400`.
An unauthenticated request returns `401`. Look up permission IDs before assigning them.

### Products (all require a valid JWT cookie)

- `POST /products` - Create a product. JSON body: `name`, `sku` (unique), `categoryId`, `price` (max 2 decimals), optional `subcategoryId` and `description`. IDs must be positive integers, and the subcategory must belong to the category. Returns `400` for invalid references and `409` if the SKU exists.
- `PUT /products/:id` - Replace a product's editable fields using the same body and validation as creation. Returns the updated product, preserving its ID and creation date. Returns `400` for invalid input or references, `404` if missing, and `409` if another product uses the SKU. Omitted optional fields reset to their creation defaults; send the complete form to retain them.
- `POST /products/:id/archive` - Archive a product without deleting its data. Returns `204`, including when already archived, `400` for an invalid ID, or `404` if missing. Archived products are excluded from listings and totals; fetching or editing one returns `404`. Their SKUs remain reserved. There is no restore endpoint yet.
- `GET /products` - List products. Response: `{ data, total, page, pageSize }`. Query params (all optional):
  - `search` - case-insensitive match on name, SKU or description
  - `category` - exact category ID
  - `subcategory` - exact subcategory ID
  - `minPrice`, `maxPrice` - price range (inclusive)
  - `sortBy` - `id`, `name`, `sku`, `category`, `subcategory`, `price` or `created_at` (default `created_at`)
  - `sortOrder` - `asc` or `desc` (default `desc`)
  - `page` (default `1`), `pageSize` (default `10`, max `100`)
- Products include `categoryId`, `categoryName`, `subcategoryId` and `subcategoryName`; subcategory fields may be `null`.
- `GET /products/categories` - List `{ id, name }` categories, including those without products.
- `POST /products/categories` - Create a category with `{ "name": "Kitchen" }`.
- `GET /products/subcategories` - List `{ id, name, categoryId }` subcategories, optionally limited by `?category=<id>`.
- `POST /products/subcategories` - Create a subcategory with `{ "name": "Mugs", "categoryId": 1 }`.
- Creating duplicate category names, or duplicate subcategory names within the same category, returns `409`. A nonexistent parent category returns `400`.
- `GET /products/:id` - Get a product by id (`404` if missing)

## Streaming Excel exports

`POST /exports/xlsx` requires the existing JWT session cookie and an uncompressed
UTF-8 `application/json` body. Send header labels separately from the data rows:

```json
{
  "headers": ["Product", "Price"],
  "rows": [
    ["Blue mug", 12.5],
    ["Plate", null]
  ]
}
```

The object must contain exactly `headers` followed by `rows`, in that order:
headers must be available before rows can stream. Header labels must be strings;
`rows` is an array of cell arrays. An empty `rows` array exports just the header.
The header has a slate background, and data rows alternate white and pale slate.
The current writer supports fills and number formats, but not bold fonts, column
widths or frozen headers. This is a styled worksheet, not an Excel structured
table with filter controls.

The original top-level array format remains supported, with alternating data-row
colors but no inferred header. For example, `[["Blue mug", 12.5, true]]` exports
one data row.

The response is an XLSX attachment with one worksheet. The frontend can choose its
download name using `?filename=products.xlsx` (URL-encode the value); it defaults
to `export.xlsx`, and `.xlsx` is appended if missing. The name is limited to 200
UTF-8 bytes before appending the extension; empty names, paths, control characters,
`.` and `..` are rejected with `400`. Unicode names are safely encoded in
`Content-Disposition`, which is exposed to cross-origin clients.

Strings, finite numbers, booleans and `null` are supported; `null` leaves a blank
cell without shifting the following columns. Strings starting with `=` remain
literal text, not formulas. Number formats are not inferred from cell values.

```bash
curl --fail --remove-on-error \
  --cookie 'token=YOUR_SESSION_TOKEN' \
  --header 'Content-Type: application/json' \
  --request POST --upload-file cells.json \
  --output export.xlsx \
  'http://localhost:3000/exports/xlsx?filename=products.xlsx'
```

The upload file is read incrementally. JSON parsing, XLSX generation and the HTTP
download all stream with backpressure; no complete request/workbook is buffered
and no temporary export file is created. This route runs **before** the ordinary
JSON body parser. `xlsx-stream-writer` 1.3.2 uses a pull-based writer with inline
strings, avoiding a shared-string table that grows with the export; `stream-json`
3.9.0 parses bounded tokens. The XLSX writer requires Node 20.19 or newer.

Clients must consume the response while uploading large requests, as curl and
Node's HTTP client can do. A client that waits for the entire upload before
reading the response can stall when backpressure reaches it; browser `fetch`
streaming uploads are half-duplex and are not suitable for this simultaneous flow.
Reverse proxies must also allow streaming uploads/responses instead of buffering
them. Keep proxy body-size/time limits appropriate for the intended export size.

Limits: 1,048,576 rows (including the header), 16,384 cells per row, 32,767 characters per string, and
4,194,304 characters of cell content per row. Objects, nested cell arrays,
non-finite numbers and text invalid in Excel XML are rejected. An empty array
produces an empty worksheet. All input is streamed, but each individual row is
assembled within these bounds.

Invalid input detected before download starts returns JSON (`400`), size limits
return `413`, unsupported content types/encodings return `415`, and missing or
expired sessions return `401`. The first row is validated before starting the
download. Once XLSX bytes have been sent, late invalid JSON or generation failures
**abort the download** instead of appending JSON or returning a misleading valid
file. Clients must discard incomplete downloads. Disconnecting cancels parsing and
generation.

## Tests

```bash
npm test
```

Schema tests use an isolated in-memory PostgreSQL engine; they do not connect to
the configured database.
