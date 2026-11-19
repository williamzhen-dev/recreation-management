import { getRouterParam } from 'nuxt/server'
import { useDeps } from '../../../http/context'
import { defineApiHandler } from '../../../http/handler'
import { clientIp, enforceRateLimit, limiters } from '../../../http/rate-limits'
import { describeToken } from '../../../modules/auth/auth.service'

/** Pre-check a setup/reset link so the page can greet the user or show "link expired". */
export default defineApiHandler(async (event) => {
  enforceRateLimit(event, limiters.setPasswordByIp, clientIp(event))
  return describeToken(useDeps(), getRouterParam(event, 'token') ?? '')
})
