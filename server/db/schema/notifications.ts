import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, timestamptz } from './_columns'
import { organizations } from './identity'

export const OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'dead'] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

export const notificationOutbox = pgTable('notification_outbox', {
  id: id(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  /** Snapshot of everything the template needs, captured when the event happened. */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  dedupeKey: text('dedupe_key'),
  status: text('status', { enum: OUTBOX_STATUSES }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
  lockedUntil: timestamptz('locked_until'),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
  createdAt: createdAt(),
  sentAt: timestamptz('sent_at'),
}, t => [
  uniqueIndex('notification_outbox_dedupe_key').on(t.dedupeKey),
  index('notification_outbox_due_idx').on(t.nextAttemptAt).where(sql`${t.status} IN ('pending', 'sending')`),
  check('notification_outbox_status_check', sql`${t.status} IN ('pending', 'sending', 'sent', 'dead')`),
])

export type OutboxRow = typeof notificationOutbox.$inferSelect
