import { useDeps } from '../../../../http/context'
import { requireOrgPermission } from '../../../../http/guards'
import { defineApiHandler } from '../../../../http/handler'
import { listMembers } from '../../../../modules/organizations/members.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'members:manage')
  return { members: await listMembers(useDeps(), ctx) }
})
