# Grocery Helper

A self-hosted PWA for two users that turns a **recipe URL → aisle-sorted grocery
list with an estimated total cost**, synced live between both phones for in-store
use. Full spec and roadmap: [recipe-grocery-pwa-plan.md](recipe-grocery-pwa-plan.md).

This repo is the **Phase 1 scaffold**: the three-container stack runs, the
database schema is in place, and the PWA shell talks to the API.

## Layout

```
docker-compose.yml      caddy + app + db
caddy/                  Dockerfile (builds the web PWA) + Caddyfile (TLS + proxy)
server/                 Node + Hono API, Postgres, migrations
  src/index.ts          app entry: runs migrations, serves /health
  src/db.ts             postgres.js connection
  src/migrate.ts        applies migrations/*.sql in order
  migrations/           001_init.sql (schema), 002_seed.sql (household list)
web/                    React + Vite PWA (installable, service worker)
  src/App.tsx           pings /api/health
```

Requests flow: **browser → Caddy** → static PWA at `/`, and `/api/*` (prefix
stripped) + `/ws` reverse-proxied to the **app** container on `:8080`.

## Run the whole stack (Docker)

```sh
cp .env.example .env          # PowerShell: copy .env.example .env
docker compose up --build
```

- App UI: <http://localhost> (Caddy on :80)
- API direct: <http://localhost:8080/health>

The `app` container runs migrations on boot, then serves the API. Postgres data
persists in the `db-data` volume.

## Local dev (hot reload, no full rebuild)

Run Postgres in Docker, the API and web on the host:

```sh
docker compose up -d db                 # Postgres on :5432

cd server && npm install && npm run dev # Hono API on :8080 (tsx watch)

cd web && npm install && npm run dev    # Vite on :5173, proxies /api + /ws
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` → `:8080`.

## Useful commands

```sh
cd server && npm run migrate    # apply pending migrations manually
cd server && npm run typecheck  # tsc --noEmit
cd web    && npm run build      # production PWA build -> web/dist
```

## Configuration (`.env`)

| Var                  | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `POSTGRES_*`         | Database name / user / password                    |
| `SITE_ADDRESS`       | `:80` for local; a hostname for auto-HTTPS in prod |
| `HOUSEHOLD_TOKEN`    | Shared bearer token for the two devices            |
| `ANTHROPIC_API_KEY`  | Haiku — ingredient parse + aisle classify (Ph. 4+) |
| `PCX_*`              | PC Express pricing (Phase 7)                       |

Secrets live only in the server env — never in the web bundle.

## Deploy (Contabo)

Per the plan, this runs alongside n8n on the Contabo box. Set `SITE_ADDRESS` to a
real subdomain so Caddy provisions TLS automatically, point DNS at the box, then
`docker compose up -d --build`. Add the `db-data` volume (nightly `pg_dump`) to
the existing restic backups, and point the n8n Watchdog at `/api/health`.

## Roadmap

Phases 2–10 in [recipe-grocery-pwa-plan.md](recipe-grocery-pwa-plan.md):
recipe scrape/parse → Haiku aisle classify → list UI → cost estimation →
live sync → Web Share Target.
