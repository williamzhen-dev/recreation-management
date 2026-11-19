import type { RequestEvent } from 'nuxt/server'
import type { Permission } from '../../shared/auth/permissions'
import type { User } from '../db/schema'
import type { OrgContext } from '../modules/organizations/access'
import { getRequestURL, getRouterParam } from 'nuxt/server'
import { AppError } from '../lib/errors'
import { loadSessionUser, toSessionUser } from '../modules/auth/auth.service'
import { resolveOrgAccess } from '../modules/organizations/access'
import { useDb } from './context'

const unauthenticated = () => new AppError('UNAUTHENTICATED', 401, 'Please sign in')

/**
 * Resolve the signed-in user from the sealed session and re-check the database:
 * a deleted user or a bumped session_version (password changed) revokes the session.
 */
export async function requireUser(event: RequestEvent): Promise<User> {
  const session = await getUserSession(event)
  const userId = session.user?.id
  const sessionVersion = session.secure?.sessionVersion
  if (!userId || typeof sessionVersion !== 'number')
    throw unauthenticated()

  const user = await loadSessionUser(useDb(), userId, sessionVersion)
  if (!user) {
    await clearUserSession(event)
    throw unauthenticated()
  }
  return user
}

/** Every operator route under /api/orgs/:orgId calls this first (D2). */
export async function requireOrgPermission(event: RequestEvent, permission: Permission): Promise<OrgContext & { user: User }> {
  const user = await requireUser(event)
  const organizationId = getRouterParam(event, 'orgId') ?? ''
  const ctx = await resolveOrgAccess(useDb(), user, organizationId, permission, {
    method: event.req.method,
    path: getRequestURL(event).pathname,
  })
  return { ...ctx, user }
}

/** Write a fresh session for a user (login, password set). */
export async function startSession(event: RequestEvent, user: User): Promise<void> {
  await replaceUserSession(event, {
    user: toSessionUser(user),
    secure: { sessionVersion: user.sessionVersion },
    loggedInAt: new Date().toISOString(),
  })
}
