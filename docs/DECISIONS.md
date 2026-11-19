# Decisions

Product and architecture decisions agreed for the MVP. Newest at the bottom of each section. When a decision changes, edit it here and note why. Deferred ideas live in [BACKLOG.md](./BACKLOG.md).

## Identity & tenancy

- **D1. Global users + memberships.** `users` is a global identity (one email = one login). Access to an organization comes from `organization_members` with a role (`owner` | `staff`). One person can belong to several orgs (part-time staff, contractors, the founder). The UI goes straight into the org when a user has one membership; an org switcher comes later.
- **D2. Organization is the tenant.** Every tenant-owned table carries `organization_id` (denormalized even when reachable via a parent) and composite FKs keep it consistent. Scoping is enforced in the application layer through one guard (`requireOrgPermission`). Postgres RLS is deferred.
- **D3. Cross-tenant access returns 404**, never 403, so IDs can't be probed. 403 is only for "you're a member but your role lacks this permission".
- **D4. Org in the URL, not in the session.** Operator API routes are `/api/orgs/:orgId/...`; there is no hidden "active org" session state.
- **D5. Permission-based RBAC.** Handlers check permissions (`bookings:write`), never role names. A single role→permission map in `shared/auth/permissions.ts` defines roles, so staff permissions are adjustable later (custom roles, facility-scoped staff) without touching handlers. MVP default: staff run day-to-day operations (bookings, blocks, customers, payments) and can view setup; owners can do everything.

## Authentication

- **D6. nuxt-auth-utils + argon2id.** Sealed cookie sessions (`httpOnly`, `Secure`, `SameSite=Lax`), secret derived from `NUXT_APP_SECRET`. Passwords hashed with argon2id (`@node-rs/argon2`, OWASP parameters). Chosen over Better Auth for full control of the DB schema.
- **D7. Session revocation via `users.session_version`.** Stored in the sealed session and compared on every authenticated request. Setting/resetting a password increments it, ending other sessions.
- **D8. No public signup during the pilot.** The founder provisions organizations with a CLI script that creates the org, finds-or-creates the owner user, adds the owner membership, and emails a setup link. Self-serve signup is a later option.
- **D9. One token table for setup and reset.** `auth_tokens(purpose: setup | reset | verify_email)`, stored only as SHA-256 hashes, single-use, expiring (setup 7 days, reset 1 hour). Using a setup link proves email ownership, so owners/staff need no separate verification.
- **D10. Owners invite staff** by email using the same find-or-create-user + membership + setup-email flow as provisioning. An existing user gets an "added to organization" email instead. The last owner of an org cannot be removed or demoted.
- **D11. Superadmin for the founder.** `users.platform_role = 'superadmin'`, granted only via CLI, never via API. Superadmins pass every org permission check without a membership; every such access is written to `audit_log`. A second factor for superadmins is a near-term follow-up.
- **D12. Login hygiene.** Generic errors (no account enumeration), rate limits on login/forgot-password, Origin check on mutating API requests (CSRF defence on top of SameSite=Lax).

## Public booking side

- **D13. Org-level public portal with nested slugs.** `/book/:orgSlug` lists the org's published facilities (filter by location and category); `/book/:orgSlug/:facilitySlug` is a facility page. Org slugs are globally unique; facility slugs are unique within an org. Single-facility orgs skip the location picker.
- **D14. Guest-only booking for the MVP.** No customer accounts (deferred). Customers are org-scoped records upserted by `(organization_id, lower(email))`.

## Availability

- **D15. Hours are per resource** (weekly local wall-clock ranges, multiple per day, no overnight ranges). The UI offers "copy to all spaces". Changing hours never alters existing bookings.
- **D16. Customer UX = pick a start, then a duration** within the resource's min/max and slot interval.
- **D17. Blocks** cover one resource or a whole facility (`resource_id` null).
- **D18. Times:** instants stored as UTC `timestamptz`; each facility stores an IANA time zone; date-only inputs are interpreted in the facility's zone; intervals are half-open `[start, end)`.
- Deferred: buffer/cleanup time, seasonal hours.

## Booking integrity

- **D19. Pending requests hold capacity.** Statuses `pending` and `confirmed` reserve the slot; `rejected` and `cancelled` release it.
- **D20. Postgres exclusion constraint is the final guard** against overlaps (`btree_gist`, `tstzrange(start_at, end_at, '[)')`, partial on active statuses). Availability checks are UX only.
- **D21. Resource row lock (`SELECT … FOR UPDATE`)** serializes booking and block writes per resource, covering booking-vs-block races that the constraint can't see.
- **D22. State changes are conditional updates** (`… WHERE status = 'pending'`), exposed as action endpoints (`/approve`, `/reject`, `/cancel`, `/reschedule`); 0 rows → `409 INVALID_TRANSITION`.
- **D23. Idempotency key** on public booking creation to make double-taps and retries safe.
- **D24. Stale pending requests are auto-rejected once their start time passes**; the dashboard shows a pending badge. Configurable auto-decline is deferred.
- **D25. Staff may override hours, minimum notice and horizon — never blocks or conflicts.**
- **D26. One booking = one resource + one time range.** No cart, multi-resource or recurring bookings in the MVP.

## Cancellation

- **D27. Booking policy = org default + optional facility override** (`booking_policies`, `facility_id` null = org default). No resource-level policies.
- **D28. Cancellation deadline is snapshotted** onto the booking (`cancellable_until`) at creation; staff reschedules recompute it from the current policy.
- **D29. Customer self-cancel via a signed manage link**: `HMAC(secret, bookingId:manage_version)`; bumping `manage_version` revokes links. A separate short human reference (e.g. `MPL-7K3QX`) is used for phone/desk lookups and is never sufficient to act on a booking.
- **D30. After the cutoff, online cancellation is blocked** and the facility's contact details are shown. Staff can always cancel. Pending requests can be withdrawn any time.

## Notifications

- **D31. Database outbox.** Notification rows are written in the same transaction as the change that causes them, delivery is attempted right after commit, and a Nitro scheduled task sweeps due rows (`FOR UPDATE SKIP LOCKED`) with exponential backoff, ending in `dead`. Payloads are snapshots taken at enqueue time; secrets (links with tokens) are stripped once sent.
- **D32. Email via SMTP everywhere** (nodemailer): Resend's SMTP in production, Mailpit locally.
- **D33. Recipients:** facility `notification_email` gets new requests and customer cancellations; instant bookings show only in the dashboard. A 24-hour reminder email is included in the MVP. Transactional email only (no marketing).

## Payments

- **D34. Ledger, not a bank.** The platform never holds or moves money.
- **D35. MVP payments = e-Transfer + staff-recorded cash/in-person.** Per-booking instructions (amount, the facility's `etransfer_email`, reference code in the message); customer "I've sent it" button (`unpaid → reported → paid`); staff "awaiting e-Transfer" list and "mark paid". A `payments` table holds manual rows.
- **D36. Payment deadline is configurable** per org/facility and snapshotted to `payment_due_at`. Overdue payments get reminders only — never auto-cancel. Request-mode bookings receive payment instructions only after approval. Paid-then-cancelled bookings go to a "refund owed" list for staff.
- Deferred: Stripe Connect (direct charges, facility as merchant of record).

## Operator dashboard

- **D37. Calendar feed endpoint** (max 31-day range, shown in the facility time zone) with a day view with one column per resource as the primary desktop view; a summary endpoint for badges; polling, no websockets.

## Abuse protection

- **D38. Cloudflare Turnstile from day one** on public booking and link-resend endpoints, a configurable cap on active pending requests per email per org (default 3), IP and per-recipient rate limits, a honeypot field, and `nuxt-security` headers.

## Infrastructure

- **D39. DigitalOcean, Toronto region:** App Platform (Node server from a Dockerfile) + Managed PostgreSQL. Canadian data residency from day one. Rejected: Cloudflare Workers + Neon (no Canadian region; Workers complicates argon2, interactive transactions and rate limits) and home hosting for production.
- **D40. PostgreSQL 18** (DO default; native `uuidv7()` for time-ordered IDs).
- **D41. Migrations are committed SQL** (drizzle-kit generate + hand-written SQL for what Drizzle can't express), run as a pre-deploy step, forward-only.
- **D42. Local dev:** Postgres 18 + Mailpit in Docker; the app runs on the host with `pnpm dev`. Integration tests run against real Postgres (`recreation_test` database).
- **D43. Observability:** Sentry free tier, errors only (no tracing, no session replay), PII scrubbing on; external uptime check on `/api/health`; structured logs without request bodies.
- **D44. No staging environment** until the first pilot is live.
- **D45. Backups:** DO managed backups + PITR, plus a weekly `pg_dump` to a different provider.
- **D46. Email uniqueness** is enforced on `lower(email)` and emails are normalized to lowercase in the application (instead of the `citext` extension).
