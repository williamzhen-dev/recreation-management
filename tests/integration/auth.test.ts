import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { authTokens, notificationOutbox, users } from '../../server/db/schema'
import {
  authenticate,
  completePasswordSetup,
  describeToken,
  loadSessionUser,
  requestPasswordReset,
} from '../../server/modules/auth/auth.service'
import { provisionOrganization } from '../../server/modules/organizations/provisioning.service'
import { createOrgWithOwner, expectAppError, TEST_PASSWORD, tokenFromLink, useTestContext } from '../helpers/context'

const { deps, db, advanceClock } = useTestContext()
const DAY = 24 * 60 * 60_000

async function provisionPendingOwner() {
  return provisionOrganization(deps, {
    name: 'Maple Sports Centre',
    slug: 'maple-sports',
    timezone: 'America/Toronto',
    owner: { email: 'jamie@example.com', name: 'Jamie Lee' },
  })
}

describe('setup links', () => {
  it('describes the token, then sets the password, verifies the email and revokes old sessions', async () => {
    const { setupLink, owner } = await provisionPendingOwner()
    const token = tokenFromLink(setupLink)

    await expect(describeToken(deps, token)).resolves.toEqual({
      purpose: 'setup',
      email: 'jamie@example.com',
      name: 'Jamie Lee',
      organizationName: 'Maple Sports Centre',
    })

    const user = await completePasswordSetup(deps, { token, password: 'a-strong-password', name: 'Jamie L.' })
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.emailVerifiedAt).toBeInstanceOf(Date)
    expect(user.name).toBe('Jamie L.')
    expect(user.sessionVersion).toBe(owner.sessionVersion + 1)

    // The old session version is now revoked; the new one is valid.
    expect(await loadSessionUser(db, user.id, owner.sessionVersion)).toBeNull()
    expect(await loadSessionUser(db, user.id, user.sessionVersion)).not.toBeNull()

    await expect(authenticate(deps, { email: 'JAMIE@example.com', password: 'a-strong-password' })).resolves.toMatchObject({ id: user.id })
  })

  it('is single-use, even when used twice concurrently', async () => {
    const token = tokenFromLink((await provisionPendingOwner()).setupLink)
    const results = await Promise.allSettled([
      completePasswordSetup(deps, { token, password: 'first-password' }),
      completePasswordSetup(deps, { token, password: 'second-password' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    await expectAppError(completePasswordSetup(deps, { token, password: 'third-password' }), 'TOKEN_INVALID')
  })

  it('expires after 7 days', async () => {
    const token = tokenFromLink((await provisionPendingOwner()).setupLink)
    advanceClock(7 * DAY + 1000)
    await expectAppError(describeToken(deps, token), 'TOKEN_INVALID')
    await expectAppError(completePasswordSetup(deps, { token, password: 'a-strong-password' }), 'TOKEN_INVALID')
  })

  it('rejects unknown tokens', async () => {
    await expectAppError(describeToken(deps, 'not-a-real-token-value-at-all'), 'TOKEN_INVALID')
  })
})

describe('authenticate', () => {
  it('returns the user and records the login time for correct credentials', async () => {
    const { owner } = await createOrgWithOwner(deps)
    const user = await authenticate(deps, { email: owner.email, password: TEST_PASSWORD })
    expect(user.id).toBe(owner.id)
    expect(user.lastLoginAt).toBeInstanceOf(Date)
  })

  it('gives the same error for a wrong password, an unknown email and a pending setup', async () => {
    const { owner } = await createOrgWithOwner(deps)
    const pending = await provisionPendingOwner()

    await expectAppError(authenticate(deps, { email: owner.email, password: 'wrong-password' }), 'INVALID_CREDENTIALS')
    await expectAppError(authenticate(deps, { email: 'nobody@example.com', password: TEST_PASSWORD }), 'INVALID_CREDENTIALS')
    await expectAppError(authenticate(deps, { email: pending.owner.email, password: TEST_PASSWORD }), 'INVALID_CREDENTIALS')
  })
})

describe('requestPasswordReset', () => {
  it('does nothing for an unknown email', async () => {
    expect(await requestPasswordReset(deps, 'nobody@example.com')).toEqual([])
    expect(await db.select().from(notificationOutbox)).toEqual([])
  })

  it('sends a 1-hour reset link to users with a password; only the newest link works', async () => {
    const { owner } = await createOrgWithOwner(deps)
    await db.delete(notificationOutbox)

    await requestPasswordReset(deps, owner.email)
    await requestPasswordReset(deps, owner.email)
    const emails = await db.select().from(notificationOutbox).orderBy(notificationOutbox.createdAt)
    expect(emails.map(email => email.type)).toEqual(['auth.reset', 'auth.reset'])

    const [first, second] = emails.map(email => tokenFromLink(email.payload.link as string))
    await expectAppError(completePasswordSetup(deps, { token: first!, password: 'new-password-1' }), 'TOKEN_INVALID')

    advanceClock(61 * 60_000)
    await expectAppError(completePasswordSetup(deps, { token: second!, password: 'new-password-2' }), 'TOKEN_INVALID')
  })

  it('sends a fresh setup link to users who never finished setup', async () => {
    const pending = await provisionPendingOwner()
    await db.delete(notificationOutbox)

    await requestPasswordReset(deps, pending.owner.email)
    const [email] = await db.select().from(notificationOutbox)
    expect(email!.type).toBe('auth.setup')

    // The original invitation link was superseded by the new one.
    await expectAppError(describeToken(deps, tokenFromLink(pending.setupLink)), 'TOKEN_INVALID')
    const user = await completePasswordSetup(deps, {
      token: tokenFromLink(email!.payload.link as string),
      password: 'a-strong-password',
    })
    expect(user.passwordHash).not.toBeNull()
  })

  it('a reset does not touch other users', async () => {
    const a = await createOrgWithOwner(deps)
    const b = await createOrgWithOwner(deps)
    await requestPasswordReset(deps, a.owner.email)
    const tokens = await db.select().from(authTokens).where(eq(authTokens.userId, b.owner.id))
    expect(tokens.every(token => token.purpose === 'setup')).toBe(true)
    const [bUser] = await db.select().from(users).where(eq(users.id, b.owner.id))
    expect(bUser!.sessionVersion).toBe(1)
  })
})
