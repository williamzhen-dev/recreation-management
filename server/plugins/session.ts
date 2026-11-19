import { createError } from 'nuxt/server'
import { useDb } from '../http/context'
import { loadSessionUser, toSessionUser } from '../modules/auth/auth.service'

/**
 * When the client fetches its session (/api/_auth/session), re-check it against the
 * database so revoked sessions disappear from the UI and the user's name stays fresh.
 */
export default () => {
  sessionHooks.hook('fetch', async (session, event) => {
    const userId = session.user?.id
    const sessionVersion = session.secure?.sessionVersion
    const user = userId && typeof sessionVersion === 'number'
      ? await loadSessionUser(useDb(), userId, sessionVersion)
      : null

    if (!user) {
      await clearUserSession(event)
      throw createError({ status: 401, message: 'Session expired' })
    }
    session.user = toSessionUser(user)
  })
}
