/**
 * pnpm db:seed — demo data for local development. Uses the real provisioning service,
 * so seeding also exercises it. All demo users share the password "password123".
 */
import type { CliContext } from '../_cli'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { eq, inArray } from 'drizzle-orm'
import { notificationOutbox, organizations, users } from '../../server/db/schema'
import { SYSTEM_ACTOR } from '../../server/modules/audit/audit'
import { hashPassword } from '../../server/modules/auth/password'
import { addMemberInTx } from '../../server/modules/organizations/members.service'
import { grantSuperadmin, provisionOrganization } from '../../server/modules/organizations/provisioning.service'
import { createCliContext, loadEnv, requireEnv, runCli } from '../_cli'
import { assertLocalDatabase } from './local-guard'

export const DEMO_PASSWORD = 'password123'

export async function seed(ctx: CliContext): Promise<void> {
  const { db } = ctx.deps
  const [existing] = await db.select().from(organizations).where(eq(organizations.slug, 'maple-sports')).limit(1)
  if (existing) {
    console.log('Demo data already present (maple-sports). Use pnpm db:reset to start over.')
    return
  }

  const outboxIds: string[] = []
  const maple = await provisionOrganization(ctx.deps, {
    name: 'Maple Sports Centre',
    slug: 'maple-sports',
    timezone: 'America/Toronto',
    owner: { email: 'owner@demo.test', name: 'Olivia Owner' },
  })
  outboxIds.push(...maple.outboxIds)

  const riverside = await provisionOrganization(ctx.deps, {
    name: 'Riverside Community Hall',
    slug: 'riverside-hall',
    timezone: 'America/Toronto',
    owner: { email: 'riverside-owner@demo.test', name: 'Rita Riverside' },
  })
  outboxIds.push(...riverside.outboxIds)

  // One staff member in both organizations, to exercise multi-org membership (D1).
  await db.transaction(async (tx) => {
    for (const org of [maple.organization, riverside.organization]) {
      const result = await addMemberInTx(tx, ctx.deps, {
        organization: org,
        email: 'staff@demo.test',
        name: 'Sam Staff',
        role: 'staff',
        actor: SYSTEM_ACTOR,
      })
      outboxIds.push(...result.outboxIds)
    }
  })

  const admin = await grantSuperadmin(ctx.deps, { email: 'admin@demo.test', name: 'Ada Admin' })
  outboxIds.push(...admin.outboxIds)

  // Demo users skip the email setup flow: give them a known password directly.
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  await db
    .update(users)
    .set({
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .where(inArray(users.email, [
      'owner@demo.test',
      'riverside-owner@demo.test',
      'staff@demo.test',
      'admin@demo.test',
    ]))
  if (outboxIds.length)
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, outboxIds))

  console.log('Seeded demo data. Sign in at /auth/login with password "password123":')
  console.log('  owner@demo.test            owner of Maple Sports Centre')
  console.log('  riverside-owner@demo.test  owner of Riverside Community Hall')
  console.log('  staff@demo.test            staff at both organizations')
  console.log('  admin@demo.test            superadmin')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(async () => {
    loadEnv()
    const url = requireEnv('NUXT_DATABASE_URL')
    assertLocalDatabase(url)
    const ctx = createCliContext(url)
    try {
      await seed(ctx)
    }
    finally {
      await ctx.close()
    }
  })
}
