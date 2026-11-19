import type { z } from 'zod'
import { AppError } from './errors'

/** Parse unknown input with a Zod schema, throwing a 422 VALIDATION_ERROR on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 422, 'Invalid request', {
      issues: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}
