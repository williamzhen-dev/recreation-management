import { setResponseStatus } from 'nuxt/server'
import { forgotPasswordSchema } from '../../../../shared/schemas/auth'
import { deliverInBackground, useDeps } from '../../../http/context'
import { defineApiHandler, parseBody } from '../../../http/handler'
import { clientIp, enforceRateLimit, limiters } from '../../../http/rate-limits'
import { requestPasswordReset } from '../../../modules/auth/auth.service'

/** Always 202 with the same body, whether or not the email has an account. */
export default defineApiHandler(async (event) => {
  const { email } = await parseBody(event, forgotPasswordSchema)
  enforceRateLimit(event, limiters.forgotByIp, clientIp(event))

  // Per-email limit is applied silently so it can't be used to detect accounts.
  if (limiters.forgotByEmail.hit(email).allowed)
    deliverInBackground(await requestPasswordReset(useDeps(), email))

  setResponseStatus(event, 202)
  return { message: 'If an account exists for that email, we\'ve sent a link to set a new password.' }
})
