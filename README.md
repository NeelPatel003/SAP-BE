# Teamora API

NestJS + PostgreSQL platform core: auth, RBAC, company registration (admin-only), audit/activity/API usage, Swagger.

## Quick start

PostgreSQL must already exist (local Homebrew or Docker). Default `DATABASE_URL` in `.env.example`:

`postgresql://teamora:teamora@localhost:5432/teamora`

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env

# 3. Migrate + seed super-admin
npx prisma generate
npx prisma migrate dev
npm run prisma:seed

# 4. Dev server
npm run start:dev
```

Optional Docker Postgres only:

```bash
docker compose up -d
```

If Prisma generate fails on sandboxed machines, engines are cached under `prisma-engines/` when present.

- API: http://localhost:4000  
- Swagger: http://localhost:4000/docs  
- Health: http://localhost:4000/health  

## Production security checklist

- `NODE_ENV=production`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ≥ 32 characters (API refuses to start otherwise)
- `CORS_ORIGINS` — explicit frontend origin(s), no `*`
- Cookies: httpOnly access + refresh (`teamora_access`, `teamora_refresh`), readable `teamora_csrf` for double-submit CSRF
- `COOKIE_SECURE=true` when served over HTTPS (also auto when `NODE_ENV=production`)
- Optional `COOKIE_DOMAIN=.yourdomain.com` when FE/API share a parent domain
- Swagger at `/docs` only when `ENABLE_SWAGGER=true` or non-production
- Auth: session cookies + login lockout after 8 failed attempts / 15 minutes per email

Default super-admin (from `.env`):

- Email: `admin@teamora.local`  
- Password: `Admin123!ChangeMe`  

## Store & Inventory (`/store`)

Company JWT required. Module `store` must be enabled on company.

Key routes: `GET /store/dashboard`, materials/warehouses, GRN, QC apply, stock, issues, ledger, aging, FIFO suggest.

**Acme test login**

- Email: `admin@acme.com`
- Password: `TempPass123!`
- Modules: store (+ stubs)

See monorepo [README](../README.md) and React routes under `/dashboard/store`.

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public |
| POST | `/auth/logout` | JWT |
| GET | `/auth/me` | JWT |
| GET | `/admin/dashboard` | Platform super-admin |
| GET/POST | `/admin/companies` | Platform super-admin |
| GET/PATCH | `/admin/companies/:id` | Platform super-admin |
| GET | `/admin/activity` | Platform super-admin |
| GET | `/admin/audit` | Platform super-admin |
| GET | `/admin/api-usage` | Platform super-admin |
