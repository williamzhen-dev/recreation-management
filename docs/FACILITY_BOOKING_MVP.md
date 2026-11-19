# Facility Booking SaaS — MVP Brief

> **Purpose:** Product context and implementation guardrails for Claude Code.  
> **Stage:** Pre-launch / MVP  
> **Founder:** Solo technical founder building part-time  
> **Target market:** Independent/private facilities first; municipalities are a possible long-term expansion.

## 1. Product Vision

Build a **simple, modern, mobile-friendly facility booking platform** for businesses and organizations that rent physical spaces by the hour.

**Core promise:** Facility operators can manage spaces, availability, and reservations from one dashboard, while customers can quickly find a time and request or book a space online.

The product should feel dramatically simpler than traditional recreation-management software. This is **not** an all-in-one recreation management suite.

## 2. Target Customers and Problem

### Initial customers

Small, independently operated facilities with one location and a handful of rentable spaces, especially:

- Indoor sports facilities (courts, gymnasiums, turf fields)
- Multi-purpose event or community spaces
- Other facilities renting rooms/spaces in hourly time slots

Start by interviewing operators in the Greater Toronto Area / York Region. Prioritize facilities currently using phone calls, email, spreadsheets, or awkward booking tools.

### Problems to solve

- Customers cannot easily see when a space is available.
- Staff manually coordinate inquiries, holds, confirmations, and schedule changes.
- Double bookings or conflicting staff-entered reservations are a risk.
- Operators lack one simple calendar for all spaces and bookings.
- Customers receive inconsistent confirmations or updates.

### Product positioning

**"A simpler way to book and manage rentable spaces."**

Compete on ease of setup, excellent mobile booking UX, and low administrative overhead—not on having the most modules.

## 3. MVP Scope (Build These First)

### A. Organization and facility setup

- Each customer business is an **organization (tenant)**.
- An organization can configure its facility and multiple **bookable spaces/resources** (e.g., Court A, Gym 1, Meeting Room).
- Configure each resource's name, description, opening/booking hours, time zone, slot duration or minimum rental duration, and basic price (if needed for display).
- Staff can mark a resource unavailable for maintenance/private use.

### B. Availability and bookings

- Show available time slots for a selected resource and date.
- Customers can create a booking **request** or, for resources configured for instant booking, receive an immediate confirmation.
- Booking details: organization, resource, customer contact, start/end, status, and optional notes.
- **Prevent overlapping active reservations**, including when requests arrive simultaneously.
- Define clear statuses (e.g., `pending`, `confirmed`, `cancelled`, `rejected`); define which statuses reserve capacity.
- Staff can create bookings manually for phone/in-person requests.

### C. Public booking experience

- Mobile-first, link-shareable booking page for each facility.
- Select a resource, date/time, enter contact information, and submit.
- Avoid mandatory customer accounts for the first version; email contact is enough.
- Display clear success/error states and booking details.

### D. Operator dashboard

- Sign-in for organization owners/staff.
- Calendar view across resources with booking status and details.
- Create, approve, reject, reschedule, and cancel bookings.
- Manage availability and blocked-off periods.
- Operator actions must be scoped to the authenticated organization.

### E. Notifications

- Email on new booking/request, approval/confirmation, cancellation, and meaningful changes.
- Reliable, retryable sending; avoid making successful booking creation depend on email delivery.

### F. Basic payment tracking (not full payment processing)

- Allow staff to track `unpaid` / `paid` / `refunded` (or equivalent) and optionally record manual payment methods such as cash or e-Transfer.
- **Online card payments / Stripe are post-MVP** unless an actual pilot customer requires them to go live.
- Do not build complex invoices, accounting integrations, taxes, or refunds in the first iteration.

## 4. Explicit Non-Goals for MVP

Do **not** build these without specific pilot-customer evidence:

- Class registration, camps, lessons, memberships, passes, or leagues
- Native iOS/Android apps
- Marketplace/discovery of facilities across organizations
- Complex pricing engines, coupons, subscriptions for renters
- Sophisticated recurring reservations or holiday exceptions (strong candidate for phase 2)
- Online credit-card payments, Stripe Connect, automated refunds (phase 2)
- Complex resource dependencies/divisible courts or room combinations (later)
- Equipment inventory, POS, municipal accounting/ERP integrations
- Multi-language support, advanced reporting/analytics, white labeling
- Microservices, Kafka, Kubernetes, or premature infrastructure complexity

## 5. Recommended Technology

Use **one Nuxt application** (not a separate Express backend) as a **modular monolith**.

| Area | Decision |
|---|---|
| Web UI + server | Nuxt 4 (Vue 3, TypeScript) with Nitro server routes |
| Package manager | pnpm (`pnpm-lock.yaml` committed, version pinned) |
| Runtime | Current supported Node.js LTS |
| Database | PostgreSQL |
| ORM | Drizzle ORM (preferred) |
| Input validation | Zod |
| Testing | Vitest for unit/integration; Playwright for essential end-to-end flows |
| Hosting | Managed Node application hosting + managed PostgreSQL |
| Email | Transactional email provider when notifications are implemented |

Avoid introducing Redis or a queue broker until there is a real need. For notifications, use a **durable database-backed outbox/job pattern** or another reliable managed mechanism; simple fire-and-forget promises are not sufficient.

### Suggested project layout

```text
app/
  pages/                 # Public booking + operator dashboard
  components/
  composables/
server/
  api/                   # Thin HTTP handlers, auth, validation
  modules/
    organizations/
    facilities/
    availability/
    bookings/
    notifications/
    payments/            # Manual tracking only initially
  db/                    # Schema, migrations, connection
shared/
  schemas/               # Shared Zod contracts when appropriate
  types/
```

**Architecture rule:** Keep business/domain logic in testable services, not buried in page components or HTTP route handlers. Avoid Nuxt-specific imports inside domain services when possible, so extraction to a standalone API would be straightforward later.

## 6. Data Model (Conceptual)

Start with a small, clear model:

- `organizations`: tenant/account, settings, time zone
- `users`: authenticated operator users
- `organization_members`: user-to-organization roles (owner/staff)
- `facilities`: physical location(s) belonging to an organization
- `resources`: bookable spaces belonging to a facility
- `availability_rules`: recurring operating hours by resource
- `blocks`: one-off resource unavailability periods
- `customers`: contact details belonging to an organization
- `bookings`: resource, customer, start/end, status, notes, created-by
- `payment_records`: manual payment state / method when enabled
- `notification_outbox`: pending/sent/failed email events when enabled

Use stable IDs, `created_at` / `updated_at`, and foreign keys. Every tenant-owned record must have a clear ownership path. Do not trust an organization ID supplied by the client without authorization checks.

## 7. Important Engineering Requirements

### Booking integrity

- Use **PostgreSQL transactions and database-enforced conflict protection** for active bookings (for example, an exclusion constraint over resource and timestamp range, with the relevant status predicate).
- Availability API checks improve UX but **are not** the final source of truth for concurrency.
- Define interval semantics consistently (`[start, end)` is a good choice so back-to-back bookings are legal).
- Ensure blocks and confirmed bookings cannot conflict in a way that violates availability rules.
- Reject stale/unavailable selections with a clear message and suggested retry.

### Time and schedules

- Store instants in UTC and store each facility's **IANA time zone**.
- Convert dates for display and operating-hours validation in the facility's local time zone.
- Handle daylight saving transitions correctly.

### Security and isolation

- Authentication for staff, with authorization on every management endpoint.
- Public booking endpoints may be unauthenticated but must be rate-limited and abuse-protected.
- Tenant-scoped queries and tests preventing cross-organization data access.
- Validate all inputs server-side; handle personally identifiable customer data conservatively.
- Include basic audit information for booking changes.
- Treat accessibility and responsive design as baseline quality requirements.

### Operational basics

- Environment-based configuration; never commit secrets.
- Structured logging, useful error messages, database migrations, backups, and basic monitoring.
- Keep costs and operational burden low for a part-time solo founder.

## 8. Key User Flows / Acceptance Criteria

1. **Operator setup:** An owner signs in, creates a facility and a bookable resource, configures hours, and receives a public booking URL.
2. **Customer booking:** A guest opens the URL on mobile, picks an available slot, enters contact details, submits, and sees a confirmation or pending-review state.
3. **Approval:** Staff see a new pending request, approve it, and the customer receives a confirmation email.
4. **Calendar management:** Staff add a phone booking or block a resource, and public availability updates accordingly.
5. **Conflict safety:** Two concurrent attempts to book the same resource/time cannot both become confirmed. Back-to-back bookings are allowed.
6. **Change handling:** Staff can reschedule or cancel a booking, and affected availability and notifications update correctly.
7. **Tenant isolation:** An operator in Organization A cannot read or modify Organization B's facilities, customers, or bookings.

## 9. Product Strategy and Phases

### Phase 0 — Validate before extensive coding

- Interview ~10–15 local facility operators about real workflows and current costs.
- Show mockups of the public flow and operator calendar.
- Find ~2 facilities interested in pilots, ideally at least 1 willing to pay after a trial.
- Record specific pain points before adding features.

### Phase 1 — MVP

- Ship the 6 feature areas above for a single pilot facility.
- Optimize for a fast setup and a great guest booking experience.
- Use real bookings to discover missing workflows.

### Phase 2 — Once customers need them

- Recurring bookings with exceptions
- Online payments (Stripe) and refund workflows
- Better staff roles, pricing flexibility, reports, and onboarding
- Multiple locations and more advanced resource relationships

### Phase 3 — Potential municipal expansion

- Complex permits/approval chains, priority allocation, advanced reporting
- Accessibility documentation, procurement needs, integrations, audit trails, enterprise support
- Only pursue after gaining traction in private/community facilities

## 10. Business Model and Validation Metrics

- **Business model:** B2B SaaS subscription billed to facility operators.
- **Early pricing hypothesis:** approximately **CAD $149 per facility/month**; validate willingness to pay rather than treating this as fixed.
- Avoid a per-booking commission initially; payment processor fees would be separate if online payments are added.
- Start with direct outreach to independent facilities in Markham, Richmond Hill, Vaughan, and the broader GTA.

Track initially:

- Number of discovery interviews and pilot commitments
- Time required to onboard a facility and publish its booking page
- Real booking volume and customer booking completion rate
- Staff time saved on booking administration
- Willingness to pay, conversion from pilot to paid, and support burden

**Primary milestone:** Get one real facility using the system for actual bookings and willing to pay for continued use.

## 11. Instructions for Claude Code

- Treat this document as the current product brief, **not** permission to implement everything at once.
- Begin by inspecting the repository and proposing a small implementation plan.
- Implement **vertical slices**: database model → service → API → UI → tests for one complete flow at a time.
- Prefer simple, production-sensible solutions over frameworks or infrastructure abstractions added "for scale."
- When business rules are ambiguous (e.g., pending requests holding inventory, cancellation windows, payments), identify the decision explicitly before baking assumptions into code.
- Prioritize booking correctness, tenant isolation, and a pleasant mobile-first experience.
- Maintain a short `DECISIONS.md` for newly agreed product/architecture decisions and defer out-of-scope ideas to `BACKLOG.md`.

---

**One-sentence summary:** A lightweight, multi-tenant facility booking SaaS, initially for private hourly-rental facilities, built as a single Nuxt 4 + Nitro + PostgreSQL app with an emphasis on simple booking UX, reliable reservations, and an operator-friendly calendar.
