import { setResponseStatus } from 'nuxt/server'
import { inviteMemberSchema } from '../../../../../shared/schemas/organizations'
import { deliverInBackground, useDeps } from '../../../../http/context'
import { requireOrgPermission } from '../../../../http/guards'
import { defineApiHandler, parseBody } from '../../../../http/handler'
import { inviteMember } from '../../../../modules/organizations/members.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'members:manage')
  const input = await parseBody(event, inviteMemberSchema)

  const { member, outboxIds } = await inviteMember(useDeps(), ctx, input)
  deliverInBackground(outboxIds)

  setResponseStatus(event, 201)
  return { member }
})
