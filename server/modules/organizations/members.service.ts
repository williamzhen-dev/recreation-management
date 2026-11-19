import type { OrgRole } from '../../../shared/auth/permissions'
import type { InviteMemberInput } from '../../../shared/schemas/organizations'
import type { DbOrTx, Tx } from '../../db/client'
import type { Organization, User } from '../../db/schema'
import type { Actor } from '../audit/audit'
import type { ServiceDeps } from '../deps'
import type { OrgContext } from './access'
import { and, asc, count, eq } from 'drizzle-orm'
import { organizationMembers, organizations, users } from '../../db/schema'
import { AppError, notFound } from '../../lib/errors'
import { recordAudit } from '../audit/audit'
import { findUserByEmail } from '../auth/auth.service'
import { issueToken } from '../auth/tokens'
import { buildLink } from '../deps'
import { enqueueNotification } from '../notifications/outbox'
import { isUuid } from './access'

export interface MemberView {
  userId: string
  email: string
  name: string
  role: OrgRole
  /** True until the user sets a password from their setup email. */
  setupPending: boolean
  createdAt: Date
}

export interface AddMemberResult {
  user: User
  userCreated: boolean
  /** Raw setup link (only when the user still needs to set a password). The CLI prints it. */
  setupLink: string | null
  outboxIds: string[]
}

/**
 * Find-or-create the user, add the membership and queue the right email:
 * a setup link for users without a password, an "added to org" notice otherwise.
 * Shared by owner provisioning (CLI) and staff invites (API).
 */
export async function addMemberInTx(
  tx: Tx,
  deps: ServiceDeps,
  input: { organization: Pick<Organization, 'id' | 'name'>, email: string, name: string, role: OrgRole, actor: Actor },
): Promise<AddMemberResult> {
  const now = deps.now()
  let user = await findUserByEmail(tx, input.email)
  let userCreated = false
  if (!user) {
    [user] = await tx.insert(users).values({
      email: input.email.toLowerCase(),
      name: input.name,
    }).returning()
    userCreated = true
  }

  const [existing] = await tx
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, input.organization.id), eq(organizationMembers.userId, user!.id)))
    .limit(1)
  if (existing)
    throw new AppError('ALREADY_MEMBER', 409, `${input.email} is already a member of this organization`)

  await tx.insert(organizationMembers).values({
    organizationId: input.organization.id,
    userId: user!.id,
    role: input.role,
    invitedByUserId: input.actor.userId,
  })

  const outboxIds: string[] = []
  let setupLink: string | null = null
  if (!user!.passwordHash) {
    const { token, expiresAt } = await issueToken(tx, {
      userId: user!.id,
      purpose: 'setup',
      organizationId: input.organization.id,
      now,
    })
    setupLink = buildLink(deps, '/auth/set-password', { token })
    const id = await enqueueNotification(tx, {
      type: 'auth.setup',
      to: user!.email,
      organizationId: input.organization.id,
      payload: {
        name: user!.name,
        organizationName: input.organization.name,
        role: input.role,
        link: setupLink,
        expiresAt: expiresAt.toISOString(),
      },
    })
    if (id)
      outboxIds.push(id)
  }
  else {
    const id = await enqueueNotification(tx, {
      type: 'auth.added_to_org',
      to: user!.email,
      organizationId: input.organization.id,
      payload: {
        name: user!.name,
        organizationName: input.organization.name,
        role: input.role,
        loginUrl: buildLink(deps, '/auth/login'),
      },
    })
    if (id)
      outboxIds.push(id)
  }

  await recordAudit(tx, input.actor, {
    organizationId: input.organization.id,
    action: 'member.added',
    entityType: 'user',
    entityId: user!.id,
    metadata: { role: input.role, userCreated },
  })

  return {
    user: user!,
    userCreated,
    setupLink,
    outboxIds,
  }
}

export async function inviteMember(deps: ServiceDeps, ctx: OrgContext, input: InviteMemberInput) {
  return deps.db.transaction(async (tx) => {
    const org = await getOrgForUpdate(tx, ctx.organizationId)
    const result = await addMemberInTx(tx, deps, { organization: org, ...input, actor: ctx.actor })
    return { member: await getMember(tx, ctx.organizationId, result.user.id), outboxIds: result.outboxIds }
  })
}

export async function listMembers(deps: ServiceDeps, ctx: OrgContext): Promise<MemberView[]> {
  const rows = await deps.db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: organizationMembers.role,
      passwordHash: users.passwordHash,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, ctx.organizationId))
    .orderBy(asc(users.name))
  return rows.map(({ passwordHash, ...row }) => ({ ...row, setupPending: !passwordHash }))
}

/**
 * Role changes and removals lock the organization row first, so two owners demoting
 * each other concurrently can't leave the organization without an owner.
 */
export async function changeMemberRole(deps: ServiceDeps, ctx: OrgContext, userId: string, role: OrgRole): Promise<MemberView> {
  return deps.db.transaction(async (tx) => {
    await getOrgForUpdate(tx, ctx.organizationId)
    const current = await getMember(tx, ctx.organizationId, userId)
    if (current.role === role)
      return current

    if (current.role === 'owner')
      await assertNotLastOwner(tx, ctx.organizationId)

    await tx
      .update(organizationMembers)
      .set({ role })
      .where(and(eq(organizationMembers.organizationId, ctx.organizationId), eq(organizationMembers.userId, userId)))

    await recordAudit(tx, ctx.actor, {
      organizationId: ctx.organizationId,
      action: 'member.role_changed',
      entityType: 'user',
      entityId: userId,
      metadata: { from: current.role, to: role },
    })
    return { ...current, role }
  })
}

export async function removeMember(deps: ServiceDeps, ctx: OrgContext, userId: string): Promise<void> {
  await deps.db.transaction(async (tx) => {
    await getOrgForUpdate(tx, ctx.organizationId)
    const current = await getMember(tx, ctx.organizationId, userId)
    if (current.role === 'owner')
      await assertNotLastOwner(tx, ctx.organizationId)

    await tx
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, ctx.organizationId), eq(organizationMembers.userId, userId)))

    await recordAudit(tx, ctx.actor, {
      organizationId: ctx.organizationId,
      action: 'member.removed',
      entityType: 'user',
      entityId: userId,
      metadata: { role: current.role },
    })
  })
}

/** Send a fresh setup link to a member who hasn't set a password yet. */
export async function resendMemberSetup(deps: ServiceDeps, ctx: OrgContext, userId: string) {
  return deps.db.transaction(async (tx) => {
    const org = await getOrgForUpdate(tx, ctx.organizationId)
    const member = await getMember(tx, ctx.organizationId, userId)
    return sendSetupLink(tx, deps, {
      userId,
      organization: org,
      role: member.role,
      actor: ctx.actor,
    })
  })
}

/** CLI: resend the setup link for an email, using the user's first organization as context. */
export async function resendSetupForEmail(deps: ServiceDeps, email: string, actor: Actor) {
  return deps.db.transaction(async (tx) => {
    const user = await findUserByEmail(tx, email)
    if (!user)
      throw notFound('User')
    const [membership] = await tx
      .select({ organizationId: organizations.id, organizationName: organizations.name, role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id))
      .orderBy(asc(organizationMembers.createdAt))
      .limit(1)
    return sendSetupLink(tx, deps, {
      userId: user.id,
      organization: membership
        ? { id: membership.organizationId, name: membership.organizationName }
        : null,
      role: membership?.role ?? null,
      actor,
    })
  })
}

async function sendSetupLink(
  tx: Tx,
  deps: ServiceDeps,
  input: { userId: string, organization: Pick<Organization, 'id' | 'name'> | null, role: OrgRole | null, actor: Actor },
): Promise<{ setupLink: string, outboxIds: string[] }> {
  const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1)
  if (!user)
    throw notFound('User')
  if (user.passwordHash)
    throw new AppError('CONFLICT', 409, 'This user has already finished setting up their account')

  const { token, expiresAt } = await issueToken(tx, {
    userId: user.id,
    purpose: 'setup',
    organizationId: input.organization?.id ?? null,
    now: deps.now(),
  })
  const setupLink = buildLink(deps, '/auth/set-password', { token })
  const id = await enqueueNotification(tx, {
    type: 'auth.setup',
    to: user.email,
    organizationId: input.organization?.id ?? null,
    payload: {
      name: user.name,
      organizationName: input.organization?.name ?? null,
      role: input.role,
      link: setupLink,
      expiresAt: expiresAt.toISOString(),
    },
  })
  await recordAudit(tx, input.actor, {
    organizationId: input.organization?.id ?? null,
    action: 'member.setup_link_resent',
    entityType: 'user',
    entityId: user.id,
  })
  return {
    setupLink,
    outboxIds: id
      ? [id]
      : [],
  }
}

async function getOrgForUpdate(tx: Tx, organizationId: string): Promise<Organization> {
  const [org] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('update')
  if (!org)
    throw notFound('Organization')
  return org
}

async function getMember(db: DbOrTx, organizationId: string, userId: string): Promise<MemberView> {
  if (!isUuid(userId))
    throw notFound('Member')
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: organizationMembers.role,
      passwordHash: users.passwordHash,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1)
  if (!row)
    throw notFound('Member')
  const { passwordHash, ...rest } = row
  return { ...rest, setupPending: !passwordHash }
}

async function assertNotLastOwner(tx: Tx, organizationId: string): Promise<void> {
  const [row] = await tx
    .select({
      owners: count(),
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')))
  if ((row?.owners ?? 0) <= 1)
    throw new AppError('LAST_OWNER', 409, 'An organization must keep at least one owner')
}
