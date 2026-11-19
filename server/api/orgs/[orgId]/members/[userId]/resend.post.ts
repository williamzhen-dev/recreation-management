import { getRouterParam, setResponseStatus } from 'nuxt/server'
import { deliverInBackground, useDeps } from '../../../../../http/context'
import { requireOrgPermission } from '../../../../../http/guards'
import { defineApiHandler } from '../../../../../http/handler'
import { resendMemberSetup } from '../../../../../modules/organizations/members.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'members:manage')
  const { outboxIds } = await resendMemberSetup(useDeps(), ctx, getRouterParam(event, 'userId') ?? '')
  deliverInBackground(outboxIds)
  setResponseStatus(event, 202)
  return { message: 'Setup link sent' }
})
