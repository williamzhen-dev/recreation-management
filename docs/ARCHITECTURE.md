# Architecture

One Nuxt 4 application (Vue 3 + Nitro server routes) as a modular monolith, backed by PostgreSQL 18 via Drizzle ORM. Decisions and their reasoning are in [DECISIONS.md](./DECISIONS.md); the HTTP surface is in [API_ENDPOINTS.md](./API_ENDPOINTS.md).

## Layout

```text
app/                      Vue pages, components, composables (public booking + operator dashboard)
server/
  api/                    Thin HTTP handlers: parse → authorize → call a service → shape the response
  http/                   HTTP-only helpers: guards, validation, error mapping (may import Nuxt)
  modules/<domain>/       Domain services. Plain TypeScript: take `deps` + input, no Nuxt imports
  db/
    schema/               Drizzle table definitions
    migrations/           Committed SQL migrations (generated + hand-written)
    client.ts             Connection factory
  lib/                    Framework-free utilities (errors, crypto, rate limiting, clock)
  plugins/, tasks/        Nitro plugins (env validation, session checks) and scheduled tasks
shared/
  auth/permissions.ts     Role → permission map (single source of truth)
  schemas/                Zod request contracts shared by server and client
  types/                  Shared types, nuxt-auth-utils session augmentation
scripts/                  CLI: admin provisioning, migrate, seed, reset
tests/                    Vitest integration tests against real Postgres
```

**Rule:** business logic lives in `server/modules/**`, which never imports from `nuxt/*` or `#imports`. That keeps services testable without booting Nuxt, and reusable from the CLI.

## Request pipeline (operator API)

```
/api/orgs/:orgId/...
  1. server/middleware/origin.ts   mutating request with a foreign Origin → 403
  2. handler
     a. requireOrgPermission(event, orgId, 'perm')
          requireUser: sealed session → load user → session_version must match (else clear + 401)
          resolveOrgAccess: superadmin → allowed + audit row
                            no membership → 404 NOT_FOUND
                            role lacks permission → 403 FORBIDDEN_ROLE
          → ctx { organizationId, userId, role, actorType }
     b. parseBody / parseQuery with a Zod schema → 422 VALIDATION_ERROR
     c. service(deps, ctx, input) — every query filters by ctx.organizationId
  3. AppError → HTTP via defineApiHandler (status + { code, details })
```

The public side never reads an org ID from the client; it resolves the tenant from `orgSlug` and verifies every referenced ID belongs to that org.

## Error contract

Errors are thrown as `AppError(code, status, message, details?)` from services and mapped to `createError({ status, message, data: { code, details } })`.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request failed schema validation (`details.issues`) |
| `UNAUTHENTICATED` | 401 | No/expired/revoked session |
| `INVALID_CREDENTIALS` | 401 | Login failed (generic) |
| `FORBIDDEN_ROLE` | 403 | Member lacks the permission |
| `FORBIDDEN_ORIGIN` | 403 | Cross-origin mutating request |
| `NOT_FOUND` | 404 | Missing, or belongs to another tenant |
| `TOKEN_INVALID` | 404 | Setup/reset token unknown, used or expired |
| `CONFLICT` / `SLUG_TAKEN` / `ALREADY_MEMBER` / `LAST_OWNER` | 409 | State conflicts |
| `SLOT_UNAVAILABLE` / `INVALID_TRANSITION` | 409 | Booking conflicts (slice 3+) |
| `RATE_LIMITED` | 429 | Too many attempts |

## Data model

IDs are `uuid` with `DEFAULT uuidv7()` (time-ordered). All tables have `created_at`; mutable ones have `updated_at`. Instants are `timestamptz` (UTC).

**Identity & tenancy (slice 1)**

| Table | Key columns |
|---|---|
| `users` | `email` (lowercase, unique on `lower(email)`), `name`, `phone?`, `password_hash?` (null = setup pending), `email_verified_at?`, `platform_role?` (`superadmin`), `session_version`, `last_login_at?` |
| `organizations` | `name`, `slug` (unique, reserved words rejected), `default_timezone` (IANA), `currency` (`CAD`) |
| `organization_members` | PK (`organization_id`, `user_id`), `role` (`owner`/`staff`), `invited_by_user_id?` |
| `auth_tokens` | `user_id`, `organization_id?` (context for setup emails), `purpose` (`setup`/`reset`/`verify_email`), `token_hash` (SHA-256, unique), `expires_at`, `used_at?` |
| `audit_log` | `organization_id?`, `actor_type` (`user`/`superadmin`/`system`/`customer`), `actor_user_id?`, `action`, `entity_type`, `entity_id`, `metadata` (jsonb) |
| `notification_outbox` | `organization_id?`, `type`, `recipient_email`, `payload` (jsonb snapshot), `dedupe_key?` (unique), `status` (`pending`/`sending`/`sent`/`dead`), `attempts`, `next_attempt_at`, `locked_until?`, `last_error?`, `provider_message_id?`, `sent_at?` |

**Later slices** (shape agreed, built with their slice)

| Table | Key columns |
|---|---|
| `facilities` | `organization_id`, `slug` (unique per org), `name`, address, `timezone`, `contact_phone`, `contact_email`, `notification_email`, `is_published`, `sort_order` |
| `resources` | `organization_id`, `facility_id` (composite FK), `name`, `slug`, `description`, `category`, `booking_mode` (`instant`/`request`), `slot_interval_minutes`, `min/max_duration_minutes`, `price_cents?`, `is_active`, `sort_order` |
| `availability_rules` | `organization_id`, `resource_id`, `weekday` (ISO 1–7), `start_time`, `end_time` (local) |
| `blocks` | `organization_id`, `facility_id`, `resource_id?` (null = whole facility), `start_at`, `end_at`, `reason`, `created_by_user_id` |
| `booking_policies` | `organization_id`, `facility_id?` (null = org default), `customer_cancel_enabled`, `cancel_cutoff_minutes`, `min_notice_minutes`, `horizon_days`, `max_pending_per_email`, `payment_due_minutes_before_start`, `etransfer_email?`, `payment_instructions?` |
| `customers` | `organization_id`, `name`, `email` (unique per org, lowercase), `phone?` |
| `bookings` | `organization_id`, `facility_id`, `resource_id`, `customer_id`, `reference`, `manage_version`, `start_at`, `end_at`, `status`, `source`, `customer_notes`, `internal_notes`, `cancellable_until`, `payment_due_at`, `quoted_amount_cents`, `payment_status`, `idempotency_key`, `created_by_user_id?` + exclusion constraint |
| `booking_events` | `organization_id`, `booking_id`, `actor_type`, `actor_user_id?`, `event`, `from_status`, `to_status`, `changes` (jsonb), `reason` |
| `payments` | `organization_id`, `booking_id`, `provider` (`manual`), `method` (`etransfer`/`cash`/`card_in_person`/`cheque`/`other`), `amount_cents`, `status`, `note`, `recorded_by_user_id` |

## Booking write path (slice 3)

```
BEGIN
  load resource (active, same org; public: facility published)
  validate duration/alignment → hours → policy (staff may override hours/notice/horizon)
  SELECT … FROM resources WHERE id = $1 FOR UPDATE      -- serializes bookings + blocks per resource
  check overlapping blocks (resource or facility-wide)
  upsert customer
  INSERT booking  → 23P01 exclusion_violation ⇒ 409 SLOT_UNAVAILABLE + suggestions
  INSERT booking_event, notification_outbox rows
COMMIT → attempt delivery of the new outbox rows
```

## Outbox delivery

1. Services insert outbox rows inside their transaction.
2. After commit, the handler triggers delivery for those rows (best effort, not awaited by the client).
3. The `notifications:deliver` Nitro task runs every minute: it claims due rows with `FOR UPDATE SKIP LOCKED` (including `sending` rows whose lock expired), sends, then marks `sent` (stripping secret payload keys) or reschedules with exponential backoff; after the max attempts the row becomes `dead`.

Templates are pure functions `payload → { subject, text, html }` in `server/modules/notifications/templates`.

## Configuration

All runtime configuration comes from environment variables (see `.env.example`), validated at startup by `server/plugins/00.env.ts`. CLI scripts read the same `.env`.

| Variable | Purpose |
|---|---|
| `NUXT_APP_SECRET` | Seals session cookies (≥ 32 chars; required in production) |
| `NUXT_DATABASE_URL` | Postgres connection |
| `NUXT_PUBLIC_APP_URL` | Absolute base URL used in email links |
| `NUXT_SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_SECURE` | SMTP (Mailpit locally, Resend in production) |
| `NUXT_EMAIL_FROM` | Sender address |
| `TEST_DATABASE_URL` | Integration test database |
