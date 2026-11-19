/**
 * Provision an organization and its owner (D8).
 *
 *   pnpm admin:create-org --name "Maple Sports" --slug maple-sports \
 *     --owner-email jamie@example.com --owner-name "Jamie Lee" [--timezone America/Toronto]
 */
import { parseArgs } from 'node:util'
import { parseInput } from '../../server/lib/validation'
import { provisionOrganization } from '../../server/modules/organizations/provisioning.service'
import { provisionOrganizationSchema } from '../../shared/schemas/organizations'
import { createCliContext, deliverNow, loadEnv, runCli } from '../_cli'

runCli(async () => {
  loadEnv()
  const { values } = parseArgs({
    options: {
      'name': { type: 'string' },
      'slug': { type: 'string' },
      'owner-email': { type: 'string' },
      'owner-name': { type: 'string' },
      'timezone': { type: 'string', default: 'America/Toronto' },
    },
  })

  const input = parseInput(provisionOrganizationSchema, {
    name: values.name,
    slug: values.slug,
    timezone: values.timezone,
    owner: { email: values['owner-email'], name: values['owner-name'] },
  })

  const ctx = createCliContext()
  try {
    const result = await provisionOrganization(ctx.deps, input)
    console.log(`Created organization "${result.organization.name}" (${result.organization.slug})`)
    console.log(`  id: ${result.organization.id}`)
    console.log(`  owner: ${result.owner.email}${result.ownerCreated ? ' (new account)' : ' (existing account)'}`)
    if (result.setupLink)
      console.log(`  setup link (valid 7 days): ${result.setupLink}`)
    await deliverNow(ctx, result.outboxIds)
  }
  finally {
    await ctx.close()
  }
})
