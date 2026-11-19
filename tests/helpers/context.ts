import type { ServiceDeps } from '../../server/modules/deps'
import type { ProvisionOrganizationInput } from '../../shared/schemas/organizations'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, inject } from 'vitest'
import { createDb } from '../../server/db/client'
import { users } from '../../server/db/schema'
import { hashPassword } from '../../server/modules/auth/password'
import { createMemoryMailer } from '../../server/modules/notifications/mailer'
import { provisionOrganization } from '../../server/modules/organizations/provisioning.service'

export const TEST_PASSWORD = 'correct horse battery'

/**
 * Per-file test context: a real database connection (truncated before each test),
 * a controllable clock and an in-memory mailer.
 */
export function useTestContext() {
  const handle = createDb(inject('testDatabaseUrl'), { max: 6 })
  const state = {
    now: new Date(),
  }
  const mailer = createMemoryMailer()
  const deps: ServiceDeps = {
    db: handle.db,
    appUrl: 'http://localhost:3000',
    now: () => state.now,
  }

  beforeEach(async () => {
    // Start slightly ahead of the database clock, which stamps DEFAULT now() columns
    // (e.g. next_attempt_at) during the test.
    state.now = new Date(Date.now() + 5_000)
    mailer.sent.length = 0
    await handle.db.execute(sql`
      TRUNCATE users, organizations, organization_members, auth_tokens, audit_log, notification_outbox
      RESTART IDENTITY CASCADE
    `)
  })

  afterAll(() => handle.close())

  return {
    deps,
    db: handle.db,
    mailer,
    advanceClock(ms: number) {
      state.now = new Date(state.now.getTime() + ms)
    },
  }
}

let orgCounter = 0

/** Provision an org whose owner has already set a password. */
export async function createOrgWithOwner(deps: ServiceDeps, overrides: Partial<ProvisionOrganizationInput> = {}) {
  orgCounter++
  const result = await provisionOrganization(deps, {
    name: `Test Org ${orgCounter}`,
    slug: `test-org-${orgCounter}`,
    timezone: 'America/Toronto',
    owner: { email: `owner${orgCounter}@example.test`, name: `Owner ${orgCounter}` },
    ...overrides,
  })
  await setPassword(deps, result.owner.id)
  const [owner] = await deps.db.select().from(users).where(eq(users.id, result.owner.id))
  return { ...result, owner: owner! }
}

export async function setPassword(deps: ServiceDeps, userId: string, password = TEST_PASSWORD) {
  await deps.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId))
}

export function tokenFromLink(link: string | null | undefined): string {
  if (!link)
    throw new Error('Expected a link')
  const token = new URL(link).searchParams.get('token')
  if (!token)
    throw new Error(`No token in ${link}`)
  return token
}

/** Assert a promise rejects with an AppError carrying `code`. */
export async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise
  }
  catch (error) {
    if ((error as { code?: string }).code === code)
      return error
    throw error
  }
  throw new Error(`Expected AppError ${code}, but the call succeeded`)
}
