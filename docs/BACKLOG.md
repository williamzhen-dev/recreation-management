# Backlog

Ideas deliberately deferred from the MVP. Each needs pilot-customer evidence before it's built. See [DECISIONS.md](./DECISIONS.md) for what's in scope.

## Accounts & access
- Customer accounts (optional; signup, email verification, "my bookings", link guest bookings after verification).
- Self-serve organization signup (gated publishing: verified email + approval or payment).
- Org switcher UI for users with several memberships.
- Facility-scoped staff (`member_facilities`) and per-org custom roles.
- Superadmin second factor (TOTP or passkey) — do before more than a couple of customers.
- Superadmin admin area (`/api/admin/**`): list orgs, view org, resend owner setup, dead-letter emails.
- Postgres row-level security as defence in depth.

## Booking & availability
- Recurring bookings with exceptions.
- Multi-resource / multi-date checkout (cart).
- Buffer / cleanup time between bookings.
- Seasonal hours (effective-dated availability rules) and holiday exceptions.
- Configurable auto-decline of pending requests after N hours.
- Customer self-reschedule.
- Cross-location search ("any gym free Saturday 2–4pm").
- Map / distance sorting, capacity and amenity filters.
- Divisible courts / room combinations.
- Drag-to-reschedule in the calendar.
- No-show tracking.

## Payments
- Stripe Connect (direct charges, facility as merchant of record, `application_fee_amount = 0`), `pending_payment` hold with expiry, webhooks, automatic refunds on self-cancel.
- Pay-after-approval payment links for request-mode bookings; staff partial refunds; dispute notifications.
- Interac e-Transfer automation: parse forwarded Interac notification emails (suggest matches), or a Canadian provider's Request Money API.
- Late-cancellation fees.
- Tax handling (Stripe Tax); MVP uses tax-inclusive prices.

## Operations
- Staging environment (after first pilot is live).
- Multiple app instances: move rate-limit counters to Postgres/Redis.
- Self-hosted GlitchTip if a customer requires error data in Canada.
- Customer data retention policy (anonymize N years after last booking).
- Multi-language support, reporting/analytics, white labelling.
