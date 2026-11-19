import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditLog, authTokens, notificationOutbox, organizationMembers } from '../../server/db/schema'
import { parseInput } from '../../server/lib/validation'
import { provisionOrganization } from '../../server/modules/organizations/provisioning.service'
import { provisionOrganizationSchema } from '../../shared/schemas/organizations'
import { createOrgWithOwner, expectAppError, useTestContext } from '../helpers/context'

const { deps, db } = useTestContext()

const input = {
  name: 'Maple Sports Centre',
  slug: 'maple-sports',
  timezone: 'America/Toronto',
  owner: { email: 'Jamie@Example.com', name: 'Jamie Lee' },
}

describe('provisionOrganization', () => {
  it('creates the org, a new owner without a password, an owner membership and a setup email', async () => {
    const result = await provisionOrganization(deps, input)

    expect(result.organization).toMatchObject({ slug: 'maple-sports', defaultTimezone: 'America/Toronto', currency: 'CAD' })
    expect(result.owner.email).toBe('jamie@example.com')
    expect(result.owner.passwordHash).toBeNull()
    expect(result.ownerCreated).toBe(true)
    expect(result.setupLink).toMatch(/^http:\/\/localhost:3000\/auth\/set-password\?token=/)

    const memberships = await db.select().from(organizationMembers)
    expect(memberships).toEqual([
      expect.objectContaining({ userId: result.owner.id, role: 'owner' }),
    ])

    const [token] = await db.select().from(authTokens)
    expect(token).toMatchObject({ purpose: 'setup', organizationId: result.organization.id, usedAt: null })
    expect(token!.tokenHash).not.toContain(new URL(result.setupLink!).searchParams.get('token'))

    const [email] = await db.select().from(notificationOutbox)
    expect(email).toMatchObject({ type: 'auth.setup', recipientEmail: 'jamie@example.com', status: 'pending' })
    expect(email!.payload).toMatchObject({ organizationName: 'Maple Sports Centre', role: 'owner' })
    expect(result.outboxIds).toEqual([email!.id])

    const actions = (await db.select().from(auditLog)).map(entry => entry.action).sort()
    expect(actions).toEqual(['member.added', 'organization.provisioned'])
  })

  it('reuses an existing account and sends an "added" email instead of a setup link', async () => {
    const { owner } = await createOrgWithOwner(deps)

    const result = await provisionOrganization(deps, {
      ...input,
      owner: {
        email: owner.email.toUpperCase(),
        name: 'Ignored Name',
      },
    })

    expect(result.ownerCreated).toBe(false)
    expect(result.owner.id).toBe(owner.id)
    expect(result.setupLink).toBeNull()
    const emails = await db.select().from(notificationOutbox).where(eq(notificationOutbox.organizationId, result.organization.id))
    expect(emails.map(email => email.type)).toEqual(['auth.added_to_org'])
  })

  it('rejects a slug that is already taken, leaving nothing behind', async () => {
    await provisionOrganization(deps, input)
    await expectAppError(
      provisionOrganization(deps, {
        ...input,
        owner: { email: 'other@example.com', name: 'Other' },
      }),
      'SLUG_TAKEN',
    )
    const memberships = await db.select().from(organizationMembers)
    expect(memberships).toHaveLength(1)
  })

  it('validates slugs and time zones', () => {
    expect(() => parseInput(provisionOrganizationSchema, { ...input, slug: 'admin' })).toThrow('Invalid request')
    expect(() => parseInput(provisionOrganizationSchema, { ...input, slug: 'Bad Slug' })).toThrow('Invalid request')
    expect(() => parseInput(provisionOrganizationSchema, { ...input, timezone: 'EST' })).toThrow('Invalid request')
    expect(() => parseInput(provisionOrganizationSchema, { ...input, timezone: 'Mars/Olympus' })).toThrow('Invalid request')
    expect(parseInput(provisionOrganizationSchema, { ...input, slug: '  Maple-Sports ' }).slug).toBe('maple-sports')
  })
})
