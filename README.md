# Recreation Facility Booking

A simple, multi-tenant booking platform for facilities that rent spaces by the hour. One Nuxt 4 app (Vue + Nitro) on PostgreSQL 18.

- Product brief: [docs/FACILITY_BOOKING_MVP.md](docs/FACILITY_BOOKING_MVP.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) · Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API: [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) · Backlog: [docs/BACKLOG.md](docs/BACKLOG.md)

## Local setup

Requirements: Node 24 (`.nvmrc`), pnpm, and two local Docker containers:

```bash
docker run -d --name recreation-postgres -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5432:5432 \
  -v recreation-pgdata:/var/lib/postgresql postgres:18
docker run -d --name recreation-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
```

```bash
pnpm install
cp .env.example .env          # then set your database credentials
pnpm db:reset                 # create recreation_dev, migrate, seed demo data
pnpm dev                      # http://localhost:3000
```

Sign in at `/auth/login` with any seeded user (password `password123`):

| Email | Access |
|---|---|
| `owner@demo.test` | Owner of Maple Sports Centre |
| `riverside-owner@demo.test` | Owner of Riverside Community Hall |
| `staff@demo.test` | Staff at both organizations |
| `admin@demo.test` | Superadmin |

Emails (setup links, password resets) land in Mailpit at http://localhost:8025. Without `NUXT_SMTP_HOST` they're printed to the server console.

## Scripts

| Command | What it does |
|---|---|
| `pnpm test` | Vitest against `TEST_DATABASE_URL` (created and migrated automatically) |
| `pnpm typecheck` / `pnpm lint` | Type and lint checks |
| `pnpm db:generate --name <name>` | Generate a SQL migration from schema changes (review it, then commit) |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` / `pnpm db:reset` | Seed / wipe + migrate + seed (local databases only) |
| `pnpm db:studio` | Browse the database |

## Provisioning (founder only)

Organizations are created by CLI — there is no public signup during the pilot.

```bash
pnpm admin:create-org --name "Maple Sports" --slug maple-sports \
  --owner-email jamie@example.com --owner-name "Jamie Lee" --timezone America/Toronto
pnpm admin:resend-setup --email jamie@example.com
pnpm admin:grant-superadmin --email you@example.com --name "Your Name"
```

Each command prints the setup link as well as emailing it.
