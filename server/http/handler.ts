import type { RequestEvent } from 'nuxt/server'
import type { z } from 'zod'
import { createError, defineEventHandler, getQuery, readBody } from 'nuxt/server'
import { AppError, isAppError } from '../lib/errors'
import { parseInput } from '../lib/validation'

/**
 * defineEventHandler + mapping of domain errors to the API error contract:
 * `{ status, message, data: { code, details } }`.
 */
export function defineApiHandler<Result>(handler: (event: RequestEvent) => Promise<Result>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (error) {
      if (isAppError(error)) {
        throw createError({
          status: error.status,
          message: error.message,
          data: { code: error.code, details: error.details },
        })
      }
      throw error
    }
  })
}

export async function parseBody<S extends z.ZodType>(event: RequestEvent, schema: S): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    throw new AppError('VALIDATION_ERROR', 422, 'Request body must be valid JSON')
  }
  return parseInput(schema, body ?? {})
}

export function parseQuery<S extends z.ZodType>(event: RequestEvent, schema: S): z.output<S> {
  return parseInput(schema, getQuery(event))
}
