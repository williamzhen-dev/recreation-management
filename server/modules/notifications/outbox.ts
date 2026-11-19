import type { Db, DbOrTx } from '../../db/client'
import type { Mailer } from './mailer'
import type { NotificationType, PayloadFor } from './templates'
import { and, eq, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { notificationOutbox } from '../../db/schema'
import { renderNotification, sensitiveKeysFor } from './templates'

export const MAX_ATTEMPTS = 8
const LOCK_MS = 5 * 60_000
const MAX_BACKOFF_MS = 6 * 60 * 60_000

export interface EnqueueInput<T extends NotificationType> {
  type: T
  to: string
  payload: PayloadFor<T>
  organizationId?: string | null
  /** Optional idempotency key: a second enqueue with the same key is ignored. */
  dedupeKey?: string
}

/**
 * Write a notification inside the caller's transaction, so it exists if and only if
 * the change that caused it commits. Returns the outbox id (null if deduplicated).
 */
export async function enqueueNotification<T extends NotificationType>(
  tx: DbOrTx,
  input: EnqueueInput<T>,
): Promise<string | null> {
  const [row] = await tx
    .insert(notificationOutbox)
    .values({
      type: input.type,
      recipientEmail: input.to,
      payload: input.payload as unknown as Record<string, unknown>,
      organizationId: input.organizationId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notificationOutbox.id })
  return row?.id ?? null
}

export interface DeliveryDeps {
  db: Db
  mailer: Mailer
  now: () => Date
}

export interface DeliveryResult {
  sent: number
  retried: number
  dead: number
  errors: { id: string, error: string }[]
}

/** Exponential backoff: 1, 2, 4, … minutes, capped at 6 hours. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1) * 60_000, MAX_BACKOFF_MS)
}

/**
 * Claim due rows (optionally only `ids`) with FOR UPDATE SKIP LOCKED so concurrent
 * workers never send the same email, then send each one.
 */
export async function deliverOutbox(
  deps: DeliveryDeps,
  options: { ids?: string[], limit?: number } = {},
): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    sent: 0,
    retried: 0,
    dead: 0,
    errors: [],
  }
  if (options.ids && options.ids.length === 0)
    return result

  const now = deps.now()
  const due = or(
    and(eq(notificationOutbox.status, 'pending'), lte(notificationOutbox.nextAttemptAt, now)),
    and(eq(notificationOutbox.status, 'sending'), lt(notificationOutbox.lockedUntil, now)),
  )
  // Rows requested by id right after commit are sent even if the app clock is slightly
  // behind the database clock that stamped next_attempt_at; retries still honour backoff.
  const fresh = and(eq(notificationOutbox.status, 'pending'), eq(notificationOutbox.attempts, 0))
  const claimable = deps.db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(options.ids
      ? and(or(due, fresh), inArray(notificationOutbox.id, options.ids))
      : due)
    .orderBy(notificationOutbox.nextAttemptAt)
    .limit(options.limit ?? 25)
    .for('update', { skipLocked: true })

  const claimed = await deps.db
    .update(notificationOutbox)
    .set({
      status: 'sending',
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      attempts: sql`${notificationOutbox.attempts} + 1`,
    })
    .where(inArray(notificationOutbox.id, claimable))
    .returning()

  for (const row of claimed) {
    try {
      const rendered = renderNotification(row.type, row.payload)
      const { messageId } = await deps.mailer.send({ to: row.recipientEmail, ...rendered })
      await deps.db
        .update(notificationOutbox)
        .set({
          status: 'sent',
          sentAt: deps.now(),
          providerMessageId: messageId,
          lockedUntil: null,
          lastError: null,
          payload: stripKeys(row.payload, sensitiveKeysFor(row.type)),
        })
        .where(eq(notificationOutbox.id, row.id))
      result.sent++
    }
    catch (error) {
      const message = describeError(error)
      const isDead = row.attempts >= MAX_ATTEMPTS || message.startsWith('Unknown notification type')
      await deps.db
        .update(notificationOutbox)
        .set(isDead
          ? { status: 'dead', lockedUntil: null, lastError: message }
          : {
              status: 'pending',
              lockedUntil: null,
              lastError: message,
              nextAttemptAt: new Date(deps.now().getTime() + backoffMs(row.attempts)),
            })
        .where(eq(notificationOutbox.id, row.id))
      if (isDead)
        result.dead++
      else
        result.retried++
      result.errors.push({ id: row.id, error: message })
    }
  }
  return result
}

/**
 * Network failures (e.g. SMTP connection refused on IPv4 + IPv6) surface as an
 * AggregateError whose own message is empty; include the inner errors and codes.
 */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0)
    return error.errors.map(describeError).join('; ')
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return error.message || (typeof code === 'string'
      ? code
      : '') || error.name
  }
  return String(error)
}

function stripKeys(payload: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  if (keys.length === 0)
    return payload
  const copy = { ...payload }
  for (const key of keys)
    copy[key] = '[redacted]'
  return copy
}
