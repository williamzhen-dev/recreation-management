import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id } from './_columns'
import { organizations, users } from './identity'

export const ACTOR_TYPES = [
  'user',
  'superadmin',
  'system',
  'customer',
] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

export const auditLog = pgTable('audit_log', {
  id: id(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  actorType: text('actor_type', { enum: ACTOR_TYPES }).notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, t => [
  index('audit_log_org_created_idx').on(t.organizationId, t.createdAt),
  check('audit_log_actor_type_check', sql`${t.actorType} IN ('user', 'superadmin', 'system', 'customer')`),
])

export type AuditLogEntry = typeof auditLog.$inferSelect
