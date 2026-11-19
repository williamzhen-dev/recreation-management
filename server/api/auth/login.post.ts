import { loginSchema } from '../../../shared/schemas/auth'
import { useDeps } from '../../http/context'
import { startSession } from '../../http/guards'
import { defineApiHandler, parseBody } from '../../http/handler'
import { clientIp, enforceRateLimit, limiters } from '../../http/rate-limits'
import { authenticate, listMemberships, toSessionUser } from '../../modules/auth/auth.service'

export default defineApiHandler(async (event) => {
  const input = await parseBody(event, loginSchema)
  enforceRateLimit(event, limiters.loginByIp, clientIp(event))
  enforceRateLimit(event, limiters.loginByEmail, input.email)

  const deps = useDeps()
  const user = await authenticate(deps, input)
  limiters.loginByEmail.reset(input.email)
  await startSession(event, user)

  return {
    user: toSessionUser(user),
    memberships: await listMemberships(deps.db, user.id),
  }
})
