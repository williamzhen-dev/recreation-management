/**
 * Send a fresh setup link to a user who hasn't set a password yet.
 *
 *   pnpm admin:resend-setup --email jamie@example.com
 */
import { parseArgs } from 'node:util'
import { parseInput } from '../../server/lib/validation'
import { SYSTEM_ACTOR } from '../../server/modules/audit/audit'
import { resendSetupForEmail } from '../../server/modules/organizations/members.service'
import { emailSchema } from '../../shared/schemas/common'
import { createCliContext, deliverNow, loadEnv, runCli } from '../_cli'

runCli(async () => {
  loadEnv()
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
    },
  })
  const email = parseInput(emailSchema, values.email)

  const ctx = createCliContext()
  try {
    const result = await resendSetupForEmail(ctx.deps, email, SYSTEM_ACTOR)
    console.log(`New setup link for ${email} (valid 7 days; older links no longer work):`)
    console.log(`  ${result.setupLink}`)
    await deliverNow(ctx, result.outboxIds)
  }
  finally {
    await ctx.close()
  }
})
