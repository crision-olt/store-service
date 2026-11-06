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
