import type { UpdateOrganizationInput } from '../../../shared/schemas/organizations'
import type { ServiceDeps } from '../deps'
import type { OrgContext } from './access'
import { eq } from 'drizzle-orm'
import { organizations } from '../../db/schema'
import { notFound } from '../../lib/errors'
import { recordAudit } from '../audit/audit'

export interface OrganizationView {
  id: string
  name: string
  slug: string
  defaultTimezone: string
  currency: string
  createdAt: Date
}

const columns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  defaultTimezone: organizations.defaultTimezone,
  currency: organizations.currency,
  createdAt: organizations.createdAt,
}

export async function getOrganization(deps: ServiceDeps, ctx: OrgContext): Promise<OrganizationView> {
  const [org] = await deps.db
    .select(columns)
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
    .limit(1)
  if (!org)
    throw notFound('Organization')
  return org
}

/** Slug changes are deliberately not allowed here: they would break public booking links. */
export async function updateOrganization(
  deps: ServiceDeps,
  ctx: OrgContext,
  input: UpdateOrganizationInput,
): Promise<OrganizationView> {
  return deps.db.transaction(async (tx) => {
    const [org] = await tx
      .update(organizations)
      .set(input)
      .where(eq(organizations.id, ctx.organizationId))
      .returning(columns)
    if (!org)
      throw notFound('Organization')

    await recordAudit(tx, ctx.actor, {
      organizationId: ctx.organizationId,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: ctx.organizationId,
      metadata: { changes: input },
    })
    return org
  })
}
