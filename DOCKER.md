# auth-service Dockerfile
# Multi-stage Node.js build for production-ready deployment

## Environment Variables

Required environment variables (see `.env.example` for template):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT signing
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Set to 'production' for production builds
- `JWT_EXPIRE` - Token expiry time (default: '7d')
- `AUTH_FRONTEND_URL` - URL of this service (for CORS)
- `DEMO_APP_URL` - URL of demo app (for CORS)

## Building and Running

```bash
# Build the image
docker build -t auth-service:latest .

# Run with environment variables
docker run -d \
  -e DATABASE_URL='postgresql://user:password@localhost:5432/auth_sso' \
  -e JWT_SECRET='your-secret-key' \
  -e NODE_ENV='production' \
  -p 3001:3001 \
  auth-service:latest
```

## Health Check

The container includes a health check endpoint on `GET /health` (implicit via server responsiveness).
