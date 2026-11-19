import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditLog } from '../../server/db/schema'
import { SYSTEM_ACTOR } from '../../server/modules/audit/audit'
import { resolveOrgAccess } from '../../server/modules/organizations/access'
import { inviteMember, removeMember } from '../../server/modules/organizations/members.service'
import { grantSuperadmin } from '../../server/modules/organizations/provisioning.service'
import { createOrgWithOwner, expectAppError, useTestContext } from '../helpers/context'

const { deps, db } = useTestContext()

describe('resolveOrgAccess (tenant isolation, D2–D5)', () => {
  it('lets an owner do everything in their own organization', async () => {
    const { organization, owner } = await createOrgWithOwner(deps)
    const ctx = await resolveOrgAccess(db, owner, organization.id, 'members:manage')
    expect(ctx).toEqual({
      organizationId: organization.id,
      userId: owner.id,
      role: 'owner',
      actor: { type: 'user', userId: owner.id },
    })
  })

  it('returns 404 — not 403 — for another tenant\'s organization', async () => {
    const a = await createOrgWithOwner(deps)
    const b = await createOrgWithOwner(deps)
    await expectAppError(resolveOrgAccess(db, a.owner, b.organization.id, 'org:read'), 'NOT_FOUND')
  })

  it('returns 404 for malformed and unknown organization ids', async () => {
    const { owner } = await createOrgWithOwner(deps)
    await expectAppError(resolveOrgAccess(db, owner, 'not-a-uuid', 'org:read'), 'NOT_FOUND')
    await expectAppError(resolveOrgAccess(db, owner, '01900000-0000-7000-8000-000000000000', 'org:read'), 'NOT_FOUND')
  })

  it('returns 403 when a staff member lacks the permission, and allows operational permissions', async () => {
    const { organization, owner } = await createOrgWithOwner(deps)
    const ownerCtx = await resolveOrgAccess(db, owner, organization.id, 'members:manage')
    const { member } = await inviteMember(deps, ownerCtx, { email: 'staff@example.com', name: 'Sam', role: 'staff' })
    const staff = { id: member.userId, platformRole: null }

    await expectAppError(resolveOrgAccess(db, staff, organization.id, 'members:manage'), 'FORBIDDEN_ROLE')
    await expectAppError(resolveOrgAccess(db, staff, organization.id, 'org:manage'), 'FORBIDDEN_ROLE')
    await expect(resolveOrgAccess(db, staff, organization.id, 'bookings:write')).resolves.toMatchObject({ role: 'staff' })
    await expect(resolveOrgAccess(db, staff, organization.id, 'org:read')).resolves.toMatchObject({ role: 'staff' })
  })

  it('lets a superadmin into any organization without a membership, and audits it', async () => {
    const { organization } = await createOrgWithOwner(deps)
    const { user: admin } = await grantSuperadmin(deps, { email: 'admin@example.com', name: 'Admin' })

    const ctx = await resolveOrgAccess(db, admin, organization.id, 'members:manage', { method: 'GET', path: '/api/x' })
    expect(ctx).toMatchObject({
      role: 'superadmin',
      actor: { type: 'superadmin', userId: admin.id },
    })

    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'superadmin.access'))
    expect(entries).toEqual([
      expect.objectContaining({
        organizationId: organization.id,
        actorUserId: admin.id,
        metadata: { permission: 'members:manage', method: 'GET', path: '/api/x' },
      }),
    ])

    await expectAppError(resolveOrgAccess(db, admin, '01900000-0000-7000-8000-000000000000', 'org:read'), 'NOT_FOUND')
  })

  it('stops access as soon as a membership is removed', async () => {
    const { organization, owner } = await createOrgWithOwner(deps)
    const ownerCtx = await resolveOrgAccess(db, owner, organization.id, 'members:manage')
    const { member } = await inviteMember(deps, ownerCtx, { email: 'staff@example.com', name: 'Sam', role: 'staff' })
    await removeMember(deps, { ...ownerCtx, actor: SYSTEM_ACTOR }, member.userId)
    await expectAppError(resolveOrgAccess(db, { id: member.userId, platformRole: null }, organization.id, 'org:read'), 'NOT_FOUND')
  })
})
