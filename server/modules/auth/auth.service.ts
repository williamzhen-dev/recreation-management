import type { LoginInput, SetPasswordInput } from '../../../shared/schemas/auth'
import type { DbOrTx } from '../../db/client'
import type { User } from '../../db/schema'
import type { ServiceDeps } from '../deps'
import { asc, eq, sql } from 'drizzle-orm'
import { organizationMembers, organizations, users } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { recordAudit } from '../audit/audit'
import { buildLink } from '../deps'
import { enqueueNotification } from '../notifications/outbox'
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password'
import { consumeToken, findUsableToken, issueToken } from './tokens'

export interface SessionUser {
  id: string
  email: string
  name: string
  platformRole: User['platformRole']
}

export interface MembershipSummary {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: 'owner' | 'staff'
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
  }
}

export async function findUserByEmail(db: DbOrTx, email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1)
  return user
}

export async function listMemberships(db: DbOrTx, userId: string): Promise<MembershipSummary[]> {
  return db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizations.name))
}

/**
 * Verify credentials. Unknown email, missing password (setup pending) and wrong
 * password all produce the same error and roughly the same timing.
 */
export async function authenticate(deps: ServiceDeps, input: LoginInput): Promise<User> {
  const user = await findUserByEmail(deps.db, input.email)
  const valid = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyAgainstDummy(input.password)

  if (!user || !valid)
    throw new AppError('INVALID_CREDENTIALS', 401, 'Incorrect email or password')

  const [updated] = await deps.db
    .update(users)
    .set({
      lastLoginAt: deps.now(),
    })
    .where(eq(users.id, user.id))
    .returning()
  return updated!
}

/**
 * Load the user behind a session, or null if the session has been revoked
 * (user deleted, or session_version bumped by a password change).
 */
export async function loadSessionUser(db: DbOrTx, userId: string, sessionVersion: number): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user || user.sessionVersion !== sessionVersion)
    return null
  return user
}

/**
 * "Forgot password". Users who never finished setup get a fresh setup link instead,
 * so ignoring the invitation email is recoverable without support.
 * Returns outbox ids to deliver; callers must always respond the same way.
 */
export async function requestPasswordReset(deps: ServiceDeps, email: string): Promise<string[]> {
  return deps.db.transaction(async (tx) => {
    const user = await findUserByEmail(tx, email)
    if (!user)
      return []

    const now = deps.now()
    const purpose = user.passwordHash ? 'reset' : 'setup'
    const { token, expiresAt } = await issueToken(tx, { userId: user.id, purpose, now })
    const link = buildLink(deps, '/auth/set-password', { token })

    const id = purpose === 'reset'
      ? await enqueueNotification(tx, {
          type: 'auth.reset',
          to: user.email,
          payload: {
            name: user.name,
            link,
            expiresAt: expiresAt.toISOString(),
          },
        })
      : await enqueueNotification(tx, {
          type: 'auth.setup',
          to: user.email,
          payload: {
            name: user.name,
            organizationName: null,
            role: null,
            link,
            expiresAt: expiresAt.toISOString(),
          },
        })

    await recordAudit(tx, { type: 'user', userId: user.id }, {
      action: purpose === 'reset'
        ? 'auth.password_reset_requested'
        : 'auth.setup_link_requested',
      entityType: 'user',
      entityId: user.id,
    })
    return id
      ? [id]
      : []
  })
}

export interface TokenDescription {
  purpose: 'setup' | 'reset'
  email: string
  name: string
  organizationName: string | null
}

export async function describeToken(deps: ServiceDeps, token: string): Promise<TokenDescription> {
  const row = await findUsableToken(deps.db, token, ['setup', 'reset'], deps.now())
  const [user] = await deps.db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1)
  if (!user)
    throw new AppError('TOKEN_INVALID', 404, 'This link is invalid or has expired')

  let organizationName: string | null = null
  if (row.organizationId) {
    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, row.organizationId))
      .limit(1)
    organizationName = org?.name ?? null
  }
  return { purpose: row.purpose as 'setup' | 'reset', ...user, organizationName }
}

/**
 * Use a setup or reset token to set the password. Marks the email verified (the link
 * proves ownership) and bumps session_version so every other session ends.
 */
export async function completePasswordSetup(deps: ServiceDeps, input: SetPasswordInput): Promise<User> {
  const passwordHash = await hashPassword(input.password)
  return deps.db.transaction(async (tx) => {
    const now = deps.now()
    const token = await consumeToken(tx, input.token, ['setup', 'reset'], now)
    const [user] = await tx
      .update(users)
      .set({
        passwordHash,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
        lastLoginAt: now,
        ...(input.name
          ? { name: input.name }
          : {}),
      })
      .where(eq(users.id, token.userId))
      .returning()

    await recordAudit(tx, { type: 'user', userId: token.userId }, {
      organizationId: token.organizationId,
      action: token.purpose === 'setup'
        ? 'auth.setup_completed'
        : 'auth.password_reset',
      entityType: 'user',
      entityId: token.userId,
    })
    return user!
  })
}
