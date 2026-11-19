import { setResponseStatus } from 'nuxt/server'
import { defineApiHandler } from '../../http/handler'

export default defineApiHandler(async (event) => {
  await clearUserSession(event)
  setResponseStatus(event, 204)
  return null
})
