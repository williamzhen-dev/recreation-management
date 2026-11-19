import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, timestamptz, updatedAt } from './_columns'

export const users = pgTable('users', {
  id: id(),
  /** Always stored lowercase; uniqueness is enforced on lower(email) as a backstop. */
  email: text('email').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  /** Null until the user completes setup from their invitation email. */
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamptz('email_verified_at'),
  platformRole: text('platform_role', {
    enum: ['superadmin'],
  }),
  /** Stored in the session; incrementing it revokes every existing session. */
  sessionVersion: integer('session_version').notNull().default(1),
  lastLoginAt: timestamptz('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`),
  check('users_platform_role_check', sql`${t.platformRole} IS NULL OR ${t.platformRole} IN ('superadmin')`),
])

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  defaultTimezone: text('default_timezone').notNull(),
  currency: text('currency').notNull().default('CAD'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex('organizations_slug_key').on(t.slug),
  check('organizations_slug_format_check', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
])

export const organizationMembers = pgTable('organization_members', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', {
    enum: ['owner', 'staff'],
  }).notNull(),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  primaryKey({
    columns: [t.organizationId, t.userId],
  }),
  index('organization_members_user_idx').on(t.userId),
  check('organization_members_role_check', sql`${t.role} IN ('owner', 'staff')`),
])

export const authTokens = pgTable('auth_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Context for setup emails ("set up your account for <org>"). */
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  purpose: text('purpose', {
    enum: ['setup', 'reset', 'verify_email'],
  }).notNull(),
  /** SHA-256 of the token; the raw token only ever exists in the email link. */
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  usedAt: timestamptz('used_at'),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('auth_tokens_token_hash_key').on(t.tokenHash),
  index('auth_tokens_user_idx').on(t.userId, t.purpose),
  check('auth_tokens_purpose_check', sql`${t.purpose} IN ('setup', 'reset', 'verify_email')`),
])

export type User = typeof users.$inferSelect
export type Organization = typeof organizations.$inferSelect
export type OrganizationMember = typeof organizationMembers.$inferSelect
export type AuthToken = typeof authTokens.$inferSelect
export type AuthTokenPurpose = AuthToken['purpose']
