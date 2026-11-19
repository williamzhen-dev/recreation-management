# API Endpoints

Conventions are described in [ARCHITECTURE.md](./ARCHITECTURE.md): JSON over HTTPS, ISO-8601 UTC instants, `[start, end)` intervals, date-only params in the facility time zone, errors as `{ status, message, data: { code, details } }`.

**Slice** says when an endpoint is built. ✅ = implemented.

## Health

| | Method | Path | Notes | Slice |
|---|---|---|---|---|
| ✅ | GET | `/api/health` | `{ status, db }`; 503 if the DB is unreachable | 1 |

## Auth & session

| | Method | Path | Notes | Slice |
|---|---|---|---|---|
| ✅ | POST | `/api/auth/login` | `{ email, password }` → `{ user, memberships }`. Generic `INVALID_CREDENTIALS`; rate limited | 1 |
| ✅ | POST | `/api/auth/logout` | Clears the session | 1 |
| ✅ | GET | `/api/auth/me` | `{ user, memberships: [{ organizationId, organizationName, organizationSlug, role }] }` | 1 |
| ✅ | POST | `/api/auth/password/forgot` | `{ email }` → always 202. Sends a reset link (or a setup link if no password yet) | 1 |
| ✅ | GET | `/api/auth/token/:token` | Pre-check a setup/reset link → `{ purpose, email, name, organizationName? }` | 1 |
| ✅ | POST | `/api/auth/password/set` | `{ token, password, name? }` → sets password, ends other sessions, logs in | 1 |

## Organization & members (operator)

| | Method | Path | Permission | Slice |
|---|---|---|---|---|
| ✅ | GET | `/api/orgs/:orgId` | `org:read` | 1 |
| ✅ | PATCH | `/api/orgs/:orgId` | `org:manage` — `{ name?, defaultTimezone? }` | 1 |
| ✅ | GET | `/api/orgs/:orgId/members` | `members:manage` — includes `setupPending` | 1 |
| ✅ | POST | `/api/orgs/:orgId/members` | `members:manage` — `{ email, name, role }`; find-or-create user, email setup or "added" | 1 |
| ✅ | PATCH | `/api/orgs/:orgId/members/:userId` | `members:manage` — `{ role }`; last owner protected | 1 |
| ✅ | DELETE | `/api/orgs/:orgId/members/:userId` | `members:manage` — last owner protected | 1 |
| ✅ | POST | `/api/orgs/:orgId/members/:userId/resend` | `members:manage` — new setup link (only while setup pending) | 1 |

Provisioning is CLI-only: `pnpm admin:create-org`, `pnpm admin:resend-setup`, `pnpm admin:grant-superadmin`.

## Facilities, resources, hours, policies (operator)

| Method | Path | Permission | Slice |
|---|---|---|---|
| GET / POST | `/api/orgs/:orgId/facilities` | `facilities:read` / `facilities:write` | 2 |
| GET / PATCH | `/api/orgs/:orgId/facilities/:facilityId` | `facilities:read` / `facilities:write` | 2 |
| GET / POST | `/api/orgs/:orgId/resources?facilityId=` | `facilities:read` / `resources:write` | 2 |
| GET / PATCH | `/api/orgs/:orgId/resources/:resourceId` | `facilities:read` / `resources:write` | 2 |
| GET / PUT | `/api/orgs/:orgId/resources/:resourceId/hours` | `facilities:read` / `resources:write` (PUT replaces the week) | 2 |
| GET / PUT | `/api/orgs/:orgId/booking-policy` | `org:read` / `org:manage` | 2 |
| GET / PUT / DELETE | `/api/orgs/:orgId/facilities/:facilityId/booking-policy` | `facilities:read` / `facilities:write` (DELETE = inherit) | 2 |

## Public booking

| Method | Path | Notes | Slice |
|---|---|---|---|
| GET | `/api/public/orgs/:orgSlug` | Org + published facilities + filter options | 3 |
| GET | `/api/public/orgs/:orgSlug/resources?facility=&category=` | Browse spaces | 3 |
| GET | `/api/public/orgs/:orgSlug/facilities/:facilitySlug/availability?date=&category=` | Starts for every matching resource | 3 |
| GET | `/api/public/orgs/:orgSlug/resources/:resourceId/availability?date=` | `{ timezone, date, freeWindows, starts }` | 3 |
| POST | `/api/public/orgs/:orgSlug/bookings` | `{ resourceId, start, end, customer, notes?, idempotencyKey, turnstileToken, website }` → 201 / 409 `SLOT_UNAVAILABLE` | 3 |
| GET | `/api/public/bookings/manage?b=&t=` | Booking + `canCancel`, `cancellableUntil`, payment instructions | 4 |
| POST | `/api/public/bookings/manage/cancel` | Self-cancel (before cutoff; pending any time) | 4 |
| POST | `/api/public/bookings/manage/report-payment` | "I've sent the e-Transfer" | 6 |
| POST | `/api/public/orgs/:orgSlug/bookings/resend-links` | `{ email, turnstileToken }` → always 200 | 4 |

## Bookings, blocks, customers (operator)

| Method | Path | Permission | Slice |
|---|---|---|---|
| GET | `/api/orgs/:orgId/calendar?from&to&facilityId&resourceIds` | `bookings:read` | 4 |
| GET | `/api/orgs/:orgId/dashboard/summary?facilityId=` | `bookings:read` | 4 |
| GET | `/api/orgs/:orgId/bookings?from&to&status&resourceId&q&refund=owed` | `bookings:read` | 4 |
| POST | `/api/orgs/:orgId/bookings` | `bookings:write` (manual booking; `overrideHours`) | 4 |
| GET / PATCH | `/api/orgs/:orgId/bookings/:bookingId` | `bookings:read` / `bookings:write` (notes, contact) | 4 |
| POST | `…/bookings/:bookingId/approve` · `/reject` · `/cancel` · `/reschedule` | `bookings:write` | 4 |
| GET / POST | `/api/orgs/:orgId/blocks` | `bookings:read` / `blocks:write` | 5 |
| PATCH / DELETE | `/api/orgs/:orgId/blocks/:blockId` | `blocks:write` | 5 |
| GET | `/api/orgs/:orgId/customers?q&limit&cursor` | `customers:read` | 6 |
| GET | `/api/orgs/:orgId/customers/:customerId` | `customers:read` | 6 |
| POST | `/api/orgs/:orgId/bookings/:bookingId/payments` | `payments:write` (cash / e-Transfer / …) | 6 |
| POST | `/api/orgs/:orgId/bookings/:bookingId/refunded` | `payments:write` (mark refund sent) | 6 |
| GET | `/api/orgs/:orgId/payments/awaiting?facilityId=` | `payments:read` | 6 |

## Internal

No HTTP endpoints for notifications: the `notifications:deliver` Nitro task (every minute) delivers the outbox, and later slices add reminder and auto-reject sweeps.
