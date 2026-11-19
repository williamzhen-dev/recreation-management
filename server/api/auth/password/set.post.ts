import { setPasswordSchema } from '../../../../shared/schemas/auth'
import { useDeps } from '../../../http/context'
import { startSession } from '../../../http/guards'
import { defineApiHandler, parseBody } from '../../../http/handler'
import { clientIp, enforceRateLimit, limiters } from '../../../http/rate-limits'
import { completePasswordSetup, listMemberships, toSessionUser } from '../../../modules/auth/auth.service'

/** Use a setup/reset token: set the password, end other sessions, sign this browser in. */
export default defineApiHandler(async (event) => {
  enforceRateLimit(event, limiters.setPasswordByIp, clientIp(event))
  const input = await parseBody(event, setPasswordSchema)

  const deps = useDeps()
  const user = await completePasswordSetup(deps, input)
  await startSession(event, user)

  return {
    user: toSessionUser(user),
    memberships: await listMemberships(deps.db, user.id),
  }
})
