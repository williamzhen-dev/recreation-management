import { updateOrganizationSchema } from '../../../../shared/schemas/organizations'
import { useDeps } from '../../../http/context'
import { requireOrgPermission } from '../../../http/guards'
import { defineApiHandler, parseBody } from '../../../http/handler'
import { updateOrganization } from '../../../modules/organizations/organizations.service'

export default defineApiHandler(async (event) => {
  const ctx = await requireOrgPermission(event, 'org:manage')
  const input = await parseBody(event, updateOrganizationSchema)
  return { organization: await updateOrganization(useDeps(), ctx, input) }
})
