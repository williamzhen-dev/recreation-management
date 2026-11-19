/**
 * Grant the superadmin platform role (D11). CLI-only by design.
 *
 *   pnpm admin:grant-superadmin --email you@example.com --name "Your Name"
 */
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { parseInput } from '../../server/lib/validation'
import { grantSuperadmin } from '../../server/modules/organizations/provisioning.service'
import { emailSchema, personNameSchema } from '../../shared/schemas/common'
import { createCliContext, deliverNow, loadEnv, runCli } from '../_cli'

runCli(async () => {
  loadEnv()
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
    },
  })
  const input = parseInput(z.object({ email: emailSchema, name: personNameSchema }), values)

  const ctx = createCliContext()
  try {
    const result = await grantSuperadmin(ctx.deps, input)
    console.log(`${result.user.email} is now a superadmin.`)
    if (result.setupLink)
      console.log(`  setup link (valid 7 days): ${result.setupLink}`)
    await deliverNow(ctx, result.outboxIds)
  }
  finally {
    await ctx.close()
  }
})
