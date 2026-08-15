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

## Render deploy

**Build command**
```bash
npm ci --include=dev && npm run build
```

**Start command**
```bash
npx prisma migrate deploy && npm run start:prod
```

Notes:
- `postinstall` runs `prisma generate` (required for Nest build).
- `prisma`, `typescript`, and `@nestjs/cli` are in `dependencies` so production installs still build.
- Use Node **20+**.
- Do not set `PORT` (Render injects it).

## Render cold starts

Free Render web services **sleep after ~15 minutes** idle. The next request can take **30–60+ seconds** (Nest boot + Prisma + Aiven). That feels like “every API is slow” after idle.

### Real fix (recommended)
Upgrade the web service instance from **Free** → **Starter** (or any paid type) in Render → service → **Instance Type**. Paid instances stay always-on (no spin-down).

### Free-tier mitigations (already in repo)
1. **In-app cron** (every 5 min) — `KeepWarmModule` pings `/health` while the process is up.  
   Set on Render: `KEEP_WARM_URL=https://<your-service>.onrender.com/health` (and optional `KEEP_WARM_ENABLED=true`).
2. GitHub Action [`.github/workflows/keep-warm.yml`](.github/workflows/keep-warm.yml) — set `HEALTH_URL` in that YAML.  
   Needed to **wake** a sleeping instance (in-app cron is dead while spun down).
3. FE warms the API on page load (`_app.jsx` health ping).
4. Optional: [UptimeRobot](https://uptimerobot.com) 5‑min HTTP monitor on the same URL.

### Optional DB URL tuning (Aiven)
Append pool limits so wake-ups don’t open too many connections:

```text
DATABASE_URL=...dev_db?sslmode=require&connection_limit=5&pool_timeout=10
```

### Expectation
Keep-alive **reduces** sleeps; it does **not** remove free-tier CPU limits. For production UX, use a paid Render instance.

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
