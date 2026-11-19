import { sql } from 'drizzle-orm'
import { defineEventHandler, setResponseStatus } from 'nuxt/server'
import { useDb } from '../http/context'

export default defineEventHandler(async (event) => {
  try {
    await useDb().execute(sql`select 1`)
    return { status: 'ok', db: 'ok' }
  }
  catch {
    setResponseStatus(event, 503)
    return { status: 'degraded', db: 'unreachable' }
  }
})
