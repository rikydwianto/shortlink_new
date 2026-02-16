# Shortlink Project Blueprint (ExpressJS + Dashboard)

Dokumen ini menjadi panduan kerja utama untuk membangun aplikasi **Shortlink** dengan backend ExpressJS dan dashboard admin/user yang lengkap.

## 1. Tujuan Proyek
- Membuat layanan pemendek URL yang cepat, aman, dan mudah dikelola.
- Menyediakan dashboard untuk:
  - Manajemen link (CRUD)
  - Analytics (click, device, referer, lokasi)
  - Manajemen pengguna, role, dan API key
  - Billing/plan (opsional tahap lanjut)

## 2. Scope Fitur
### MVP (Phase 1)
- Auth dasar (register/login/logout)
- Buat shortlink custom/random
- Redirect shortlink ke URL asli
- Daftar shortlink milik user
- Statistik dasar: total klik per link
- Dashboard web responsive

### Phase 2
- QR code per link
- Expired link, password-protected link
- UTM builder
- Analytics lanjutan (device, browser, OS, referer)
- Team workspace (owner/member)

### Phase 3
- Paket berlangganan + payment
- Domain custom per workspace
- API publik + API key management
- Webhook/event stream

## 3. Rekomendasi Tech Stack
## Backend
- **Runtime**: Node.js LTS
- **Framework**: ExpressJS
- **Language**: Javascript
- **ORM**: Prisma
- **Database**: MYSQL
- **Cache/Queue**: Redis + BullMQ
- **Validation**: Zod
- **Auth**: JWT (access/refresh) + cookie secure
- **Rate limit**: `rate-limiter-flexible` / `express-rate-limit`
- **Logging**: Pino
- **Docs API**: Swagger/OpenAPI (via `swagger-ui-express`)

## Frontend Dashboard
- **Framework**: Next.js (App Router) + React
- **UI**: Tailwind CSS + shadcn/ui
- **State/Data Fetching**: TanStack Query
- **Form**: React Hook Form + Zod resolver
- **Chart**: Recharts / ECharts

## Infra & DevOps
- **Container**: Docker + Docker Compose
- **Reverse Proxy**: Nginx / Caddy
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana (atau Sentry untuk error tracking)

## 4. Struktur Monorepo yang Disarankan
```txt
shortlink/
  apps/
    api/                 # ExpressJS API
    dashboard/           # Next.js dashboard
  packages/
    config/              # shared tsconfig/eslint/prettier
    ui/                  # shared UI components (opsional)
    types/               # shared types/contracts
  infra/
    docker/
    nginx/
  docs/
    api/
    adr/
  .github/workflows/
```

## 5. Arsitektur Sistem
1. User membuat shortlink dari dashboard atau API.
2. API validasi URL + policy, simpan ke PostgreSQL.
3. Endpoint redirect `GET /:code`:
   - cek cache Redis dulu
   - fallback database jika cache miss
   - catat click event async ke queue
   - redirect 301/302 sesuai setting link
4. Worker memproses event click dan agregasi analytics.
5. Dashboard mengambil data agregasi untuk chart/report.

## 6. Desain Data (Core Entities)
- `users`
  - id, email, password_hash, role, created_at
- `workspaces`
  - id, name, owner_id, plan
- `workspace_members`
  - workspace_id, user_id, role
- `links`
  - id, workspace_id, code, target_url, title, is_active, expires_at, password_hash, created_by, created_at
- `link_click_events`
  - id, link_id, clicked_at, ip_hash, user_agent, referer, country, city, device_type
- `link_daily_stats`
  - link_id, date, total_clicks, unique_clicks
- `api_keys`
  - id, workspace_id, key_hash, scopes, last_used_at

Catatan:
- `code` harus unique global (atau unique per domain jika custom domain).
- Simpan IP dalam bentuk hash untuk privasi.

## 7. API Design (Ringkas)
## Public
- `GET /:code` -> redirect
- `GET /health` -> health check

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Links
- `POST /links`
- `GET /links`
- `GET /links/:id`
- `PATCH /links/:id`
- `DELETE /links/:id`
- `POST /links/:id/toggle`

## Analytics
- `GET /links/:id/analytics?from=&to=`
- `GET /dashboard/overview?from=&to=`

## Workspace/Admin
- `POST /workspaces`
- `POST /workspaces/:id/members`
- `DELETE /workspaces/:id/members/:userId`
- `POST /api-keys`
- `DELETE /api-keys/:id`

## 8. Dashboard Modules
- Auth pages: login/register/forgot password
- Overview: total links, total clicks, CTR-like indicators
- Link management table: search, filter, sort, pagination
- Link detail page: chart harian, top referer, top country/device
- Settings: profile, workspace, API keys
- Admin panel (opsional): user & abuse management

## 9. Security Checklist
- Validasi ketat URL target (allow `http/https` only)
- Block private/internal network targets (anti SSRF)
- JWT rotation + refresh token revocation
- Rate limit login, create-link, redirect
- CSRF protection jika pakai cookie auth
- Helmet + CORS policy ketat
- Audit log untuk aksi sensitif
- Password hashing dengan Argon2/Bcrypt

## 10. Performance & Scalability
- Cache mapping `code -> target_url` di Redis
- Gunakan queue untuk click tracking agar redirect tetap cepat
- Index DB penting:
  - `links(code)` unique
  - `links(workspace_id, created_at)`
  - `link_click_events(link_id, clicked_at)`
  - `link_daily_stats(link_id, date)`
- Pertimbangkan partitioning pada tabel event jika trafik tinggi

## 11. Testing Strategy
- Unit test: service, util, validation
- Integration test: endpoint + DB test container
- E2E test:
  - create shortlink -> redirect works
  - auth + protected endpoints
  - analytics pipeline basic
- Load test untuk redirect endpoint (k6/Artillery)

Target coverage awal: minimal 70% pada service core.

## 12. Observability
- Structured logging (Pino) dengan request-id
- Metrics:
  - redirect latency p95/p99
  - redirect success rate
  - click event queue lag
  - DB query latency
- Alert minimum:
  - error rate naik tajam
  - queue tertahan
  - DB/Redis down

## 13. Rencana Eksekusi Sprint
### Sprint 0 (Setup)
- Inisialisasi monorepo + tooling
- Setup CI lint/test
- Setup Docker lokal (Postgres, Redis)

### Sprint 1 (Core URL Shortener)
- Auth
- CRUD links
- Redirect endpoint + cache
- Dashboard basic list/create link

### Sprint 2 (Analytics)
- Click event ingestion + queue worker
- Aggregation job
- Dashboard analytics charts

### Sprint 3 (Hardening)
- Security improvements
- Rate limiting & abuse prevention
- Performance tuning + load test

### Sprint 4 (Advanced)
- Custom domain
- Team workspace
- API keys + public API docs

## 14. Definition of Done (DoD)
Satu fitur dianggap selesai jika:
- Kebutuhan bisnis terpenuhi
- Ada validasi input/output
- Ada test (unit/integration sesuai level)
- Lulus lint, type-check, test CI
- Ada logging yang cukup untuk troubleshooting
- Dokumen endpoint/flow diperbarui

## 15. Risiko & Mitigasi
- Abuse untuk phishing/spam
  - mitigasi: domain blocklist, report abuse, rate limiting
- Analytics membengkak
  - mitigasi: event pipeline + aggregation + retention policy
- Bottleneck redirect
  - mitigasi: Redis cache + minimal logic di redirect path

## 16. Next Action (Langsung Dikerjakan)
1. Setup monorepo (`apps/api`, `apps/dashboard`, `packages/config`).
2. Bootstrap Express + Prisma + PostgreSQL schema awal.
3. Implement auth + link CRUD + redirect endpoint.
4. Build dashboard basic (login, list/create link).
5. Tambah queue worker untuk click analytics.

---

Jika kamu setuju blueprint ini, langkah berikutnya saya bisa langsung generate skeleton project sesuai struktur di atas.
