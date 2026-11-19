import type { OrgRole, Permission } from '../../../shared/auth/permissions'
import type { DbOrTx } from '../../db/client'
import type { User } from '../../db/schema'
import type { Actor } from '../audit/audit'
import { and, eq } from 'drizzle-orm'
import { roleHasPermission } from '../../../shared/auth/permissions'
import { organizationMembers, organizations } from '../../db/schema'
import { AppError, notFound } from '../../lib/errors'
import { recordAudit } from '../audit/audit'

/** Who is acting, in which organization, with which role. Every operator service takes one. */
export interface OrgContext {
  organizationId: string
  userId: string
  role: OrgRole | 'superadmin'
  actor: Actor
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * The tenancy chokepoint (D2–D5, D11):
 *  - superadmin → allowed in any existing org, and the access is audit-logged
 *  - not a member (or org doesn't exist) → 404, so org IDs can't be probed
 *  - member whose role lacks the permission → 403
 */
export async function resolveOrgAccess(
  db: DbOrTx,
  user: Pick<User, 'id' | 'platformRole'>,
  organizationId: string,
  permission: Permission,
  request?: { method: string, path: string },
): Promise<OrgContext> {
  if (!isUuid(organizationId))
    throw notFound('Organization')

  if (user.platformRole === 'superadmin') {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1)
    if (!org)
      throw notFound('Organization')

    const actor: Actor = { type: 'superadmin', userId: user.id }
    await recordAudit(db, actor, {
      organizationId,
      action: 'superadmin.access',
      metadata: { permission, ...request },
    })
    return {
      organizationId,
      userId: user.id,
      role: 'superadmin',
      actor,
    }
  }

  const [membership] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, user.id),
    ))
    .limit(1)
  if (!membership)
    throw notFound('Organization')

  if (!roleHasPermission(membership.role, permission))
    throw new AppError('FORBIDDEN_ROLE', 403, 'Your role does not allow this action', { permission })

  return {
    organizationId,
    userId: user.id,
    role: membership.role,
    actor: { type: 'user', userId: user.id },
  }
}
