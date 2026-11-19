import { getRouterParam, setResponseStatus } from 'nuxt/server'
import { useDeps } from '../../../../../http/context'
import { requireOrgPermission } from '../../../../../http/guards'
import { defineApiHandler } from '../../../../../http/handler'
import { removeMember } from '../../../../../modules/organizations/members.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'members:manage')
  await removeMember(useDeps(), ctx, getRouterParam(event, 'userId') ?? '')
  setResponseStatus(event, 204)
  return null
})
