import { useDb } from '../../http/context'
import { requireUser } from '../../http/guards'
import { defineApiHandler } from '../../http/handler'
import { listMemberships, toSessionUser } from '../../modules/auth/auth.service'

export default defineApiHandler(async (event) => {
  const user = await requireUser(event)
  return {
    user: toSessionUser(user),
    memberships: await listMemberships(useDb(), user.id),
  }
})
