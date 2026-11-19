import { getRouterParam } from 'nuxt/server'
import { changeMemberRoleSchema } from '../../../../../../shared/schemas/organizations'
import { useDeps } from '../../../../../http/context'
import { requireOrgPermission } from '../../../../../http/guards'
import { defineApiHandler, parseBody } from '../../../../../http/handler'
import { changeMemberRole } from '../../../../../modules/organizations/members.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'members:manage')
  const { role } = await parseBody(event, changeMemberRoleSchema)
  return { member: await changeMemberRole(useDeps(), ctx, getRouterParam(event, 'userId') ?? '', role) }
})
