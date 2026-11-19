import type { ProvisionOrganizationInput } from '../../../shared/schemas/organizations'
import type { Organization, User } from '../../db/schema'
import type { Actor } from '../audit/audit'
import type { ServiceDeps } from '../deps'
import { eq } from 'drizzle-orm'
import { organizations, users } from '../../db/schema'
import { AppError, isUniqueViolation } from '../../lib/errors'
import { recordAudit, SYSTEM_ACTOR } from '../audit/audit'
import { findUserByEmail } from '../auth/auth.service'
import { issueToken } from '../auth/tokens'
import { buildLink } from '../deps'
import { enqueueNotification } from '../notifications/outbox'
import { addMemberInTx } from './members.service'

export interface ProvisionResult {
  organization: Organization
  owner: User
  ownerCreated: boolean
  setupLink: string | null
  outboxIds: string[]
}

/**
 * Founder-only (CLI): create an organization and its owner in one transaction (D8).
 * The owner gets a setup link, or an "added" notice if they already have an account.
 */
export async function provisionOrganization(
  deps: ServiceDeps,
  input: ProvisionOrganizationInput,
  actor: Actor = SYSTEM_ACTOR,
): Promise<ProvisionResult> {
  try {
    return await deps.db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({ name: input.name, slug: input.slug, defaultTimezone: input.timezone })
        .returning()

      const member = await addMemberInTx(tx, deps, {
        organization: organization!,
        email: input.owner.email,
        name: input.owner.name,
        role: 'owner',
        actor,
      })

      await recordAudit(tx, actor, {
        organizationId: organization!.id,
        action: 'organization.provisioned',
        entityType: 'organization',
        entityId: organization!.id,
        metadata: { slug: input.slug, ownerUserId: member.user.id },
      })

      return {
        organization: organization!,
        owner: member.user,
        ownerCreated: member.userCreated,
        setupLink: member.setupLink,
        outboxIds: member.outboxIds,
      }
    })
  }
  catch (error) {
    if (isUniqueViolation(error, 'organizations_slug_key'))
      throw new AppError('SLUG_TAKEN', 409, `The slug "${input.slug}" is already taken`)
    throw error
  }
}

/**
 * Founder-only (CLI): grant the superadmin platform role. Creates the user if needed
 * and returns a setup link when they have no password yet. Never exposed over HTTP (D11).
 */
export async function grantSuperadmin(deps: ServiceDeps, input: { email: string, name: string }) {
  return deps.db.transaction(async (tx) => {
    let user = await findUserByEmail(tx, input.email)
    if (!user) {
      [user] = await tx.insert(users).values({
        email: input.email.toLowerCase(),
        name: input.name,
      }).returning()
    }

    const [updated] = await tx
      .update(users)
      .set({ platformRole: 'superadmin' })
      .where(eq(users.id, user!.id))
      .returning()

    let setupLink: string | null = null
    const outboxIds: string[] = []
    if (!updated!.passwordHash) {
      const { token, expiresAt } = await issueToken(tx, {
        userId: updated!.id,
        purpose: 'setup',
        now: deps.now(),
      })
      setupLink = buildLink(deps, '/auth/set-password', { token })
      const id = await enqueueNotification(tx, {
        type: 'auth.setup',
        to: updated!.email,
        payload: {
          name: updated!.name,
          organizationName: null,
          role: null,
          link: setupLink,
          expiresAt: expiresAt.toISOString(),
        },
      })
      if (id)
        outboxIds.push(id)
    }

    await recordAudit(tx, SYSTEM_ACTOR, {
      action: 'platform.superadmin_granted',
      entityType: 'user',
      entityId: updated!.id,
    })
    return { user: updated!, setupLink, outboxIds }
  })
}
