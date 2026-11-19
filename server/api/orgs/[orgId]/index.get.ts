import { useDeps } from '../../../http/context'
import { requireOrgPermission } from '../../../http/guards'
import { defineApiHandler } from '../../../http/handler'
import { getOrganization } from '../../../modules/organizations/organizations.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'org:read')
  return { organization: await getOrganization(useDeps(), ctx), role: ctx.role }
})
