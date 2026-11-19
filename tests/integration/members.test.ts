import type { OrgContext } from '../../server/modules/organizations/access'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notificationOutbox, organizationMembers } from '../../server/db/schema'
import { completePasswordSetup, describeToken } from '../../server/modules/auth/auth.service'
import { resolveOrgAccess } from '../../server/modules/organizations/access'
import {
  changeMemberRole,
  inviteMember,
  listMembers,
  removeMember,
  resendMemberSetup,
} from '../../server/modules/organizations/members.service'
import { createOrgWithOwner, expectAppError, setPassword, tokenFromLink, useTestContext } from '../helpers/context'

const { deps, db } = useTestContext()

async function ownerContext() {
  const org = await createOrgWithOwner(deps)
  const ctx = await resolveOrgAccess(db, org.owner, org.organization.id, 'members:manage')
  return { ...org, ctx }
}

describe('inviteMember', () => {
  it('creates a pending user and emails a setup link naming the organization', async () => {
    const { ctx, organization } = await ownerContext()
    const { member, outboxIds } = await inviteMember(deps, ctx, { email: 'Sam@Example.com', name: 'Sam Staff', role: 'staff' })

    expect(member).toMatchObject({ email: 'sam@example.com', role: 'staff', setupPending: true })
    const [email] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxIds[0]!))
    expect(email).toMatchObject({ type: 'auth.setup', recipientEmail: 'sam@example.com', organizationId: organization.id })

    const token = tokenFromLink(email!.payload.link as string)
    await expect(describeToken(deps, token)).resolves.toMatchObject({ organizationName: organization.name })
  })

  it('adds an existing account (e.g. staff at another facility) without a new setup link', async () => {
    const a = await ownerContext()
    const b = await ownerContext()
    await inviteMember(deps, a.ctx, { email: 'sam@example.com', name: 'Sam', role: 'staff' })
    const [samMembership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, a.organization.id), eq(organizationMembers.role, 'staff')))
    await setPassword(deps, samMembership!.userId)

    const { member, outboxIds } = await inviteMember(deps, b.ctx, { email: 'sam@example.com', name: 'Sam', role: 'owner' })
    expect(member).toMatchObject({ userId: samMembership!.userId, role: 'owner', setupPending: false })
    const [email] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxIds[0]!))
    expect(email!.type).toBe('auth.added_to_org')
  })

  it('rejects inviting someone who is already a member', async () => {
    const { ctx, owner } = await ownerContext()
    await expectAppError(inviteMember(deps, ctx, { email: owner.email, name: 'Me', role: 'staff' }), 'ALREADY_MEMBER')
  })
})

describe('roles and removal', () => {
  it('lists members with their setup state', async () => {
    const { ctx, owner } = await ownerContext()
    await inviteMember(deps, ctx, { email: 'sam@example.com', name: 'Sam', role: 'staff' })
    const members = await listMembers(deps, ctx)
    expect(members.map(m => [m.email, m.role, m.setupPending])).toEqual([
      [owner.email, 'owner', false],
      ['sam@example.com', 'staff', true],
    ])
  })

  it('never lets the last owner be demoted or removed', async () => {
    const { ctx, owner } = await ownerContext()
    await expectAppError(changeMemberRole(deps, ctx, owner.id, 'staff'), 'LAST_OWNER')
    await expectAppError(removeMember(deps, ctx, owner.id), 'LAST_OWNER')
  })

  it('allows demoting an owner while another owner remains', async () => {
    const { ctx, owner } = await ownerContext()
    const { member } = await inviteMember(deps, ctx, { email: 'co-owner@example.com', name: 'Co', role: 'owner' })
    await expect(changeMemberRole(deps, ctx, owner.id, 'staff')).resolves.toMatchObject({ role: 'staff' })
    await expectAppError(removeMember(deps, ctx, member.userId), 'LAST_OWNER')
  })

  it('keeps one owner when two owners demote each other at the same time', async () => {
    const { ctx, owner } = await ownerContext()
    const { member: coOwner } = await inviteMember(deps, ctx, { email: 'co-owner@example.com', name: 'Co', role: 'owner' })
    const coCtx: OrgContext = {
      ...ctx,
      userId: coOwner.userId,
      actor: { type: 'user', userId: coOwner.userId },
    }

    const results = await Promise.allSettled([
      changeMemberRole(deps, ctx, coOwner.userId, 'staff'),
      changeMemberRole(deps, coCtx, owner.id, 'staff'),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)

    const owners = await db.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, ctx.organizationId),
      eq(organizationMembers.role, 'owner'),
    ))
    expect(owners).toHaveLength(1)
  })

  it('cannot touch members of another organization through its own context', async () => {
    const a = await ownerContext()
    const b = await ownerContext()
    await expectAppError(changeMemberRole(deps, a.ctx, b.owner.id, 'staff'), 'NOT_FOUND')
    await expectAppError(removeMember(deps, a.ctx, b.owner.id), 'NOT_FOUND')
    await expectAppError(resendMemberSetup(deps, a.ctx, b.owner.id), 'NOT_FOUND')
  })
})

describe('resendMemberSetup', () => {
  it('issues a new link and invalidates the previous one', async () => {
    const { ctx } = await ownerContext()
    const { member, outboxIds } = await inviteMember(deps, ctx, { email: 'sam@example.com', name: 'Sam', role: 'staff' })
    const [first] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, outboxIds[0]!))

    const { setupLink } = await resendMemberSetup(deps, ctx, member.userId)
    await expectAppError(describeToken(deps, tokenFromLink(first!.payload.link as string)), 'TOKEN_INVALID')
    await completePasswordSetup(deps, {
      token: tokenFromLink(setupLink),
      password: 'a-strong-password',
    })

    await expectAppError(resendMemberSetup(deps, ctx, member.userId), 'CONFLICT')
  })
})
