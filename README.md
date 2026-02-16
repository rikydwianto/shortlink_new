# Shortlink Monorepo (JavaScript)

Aplikasi shortlink berbasis monorepo dengan 2 app utama:
- `apps/api`: REST API (Express + Prisma + PostgreSQL)
- `apps/dashboard`: Dashboard web (Next.js + React)

Project ini mendukung:
- Auth (register/login) + role (`USER`, `ADMIN`, `SUPER_ADMIN`)
- CRUD shortlink (my links dan all links untuk admin)
- Redirect shortlink `GET /:code`
- Aturan link: active/nonactive, schedule, expiry, max click, device/location restriction, password-protected
- Dashboard management untuk link dan user
- Halaman error redirect yang user-friendly (bukan JSON), termasuk prompt password dengan SweetAlert

## Struktur Repo
```txt
shortlink/
  apps/
    api/        # Express API
    dashboard/  # Next.js dashboard
  infra/
    docker-compose.yml  # PostgreSQL + Redis
```

## Tech Stack
- Backend: Node.js, Express, Prisma, PostgreSQL, JWT, Zod, Pino
- Frontend: Next.js (App Router), React, SweetAlert2
- Infra lokal: Docker Compose (PostgreSQL, Redis)

## Prasyarat
- Node.js 20+
- npm 10+
- Docker Desktop

## Setup Lokal
1. Install dependency dan jalankan service database/cache:
```bash
npm install
docker compose -f infra/docker-compose.yml up -d
```

2. Siapkan environment file:
```bash
copy apps\api\.env.example apps\api\.env
copy "apps\dashboard\.env copy.example" apps\dashboard\.env
```

3. Generate client Prisma + migrate + seed:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed -w @shortlink/api
```

## Akun Default (Seed)
- `SUPER_ADMIN`: `super@shortlink.local` / `super12345`
- `ADMIN`: `admin@shortlink.local` / `admin12345`

## Menjalankan Project
### Development
```bash
npm run dev
```

### Production
1. Build:
```bash
npm run build
```

2. Jalankan API + Dashboard sekaligus:
```bash
npm run prod
```

## URL Default
- API: `http://localhost:4000`
- Dashboard: `http://localhost:3000`

## Script Root
- `npm run dev` -> API + Dashboard mode development
- `npm run build` -> build semua app
- `npm run prod` -> start API + Dashboard mode production
- `npm run lint` -> lint placeholder (belum dikonfigurasi penuh)
- `npm run db:generate` -> prisma generate
- `npm run db:migrate` -> prisma migrate dev
- `npm run db:seed` -> seed data awal

## Endpoint Utama
- Health: `GET /health`
- Redirect: `GET /:code`
- Auth: `/auth/*`
- User links: `/links/*`
- Analytics: `/analytics/*`
- Admin area: `/admin/*`

## Catatan Redirect Error Page
Jika shortlink tidak bisa dibuka (not found, nonaktif, expired, butuh password, dll), API merender halaman HTML yang lebih informatif.
Untuk link ber-password, user akan langsung diminta input password via modal SweetAlert.

## Build Check
```bash
npm run lint
npm run build
```
