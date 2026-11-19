/**
 * Domain error thrown by services. The HTTP layer maps it to a response:
 * `{ status, message, data: { code, details } }`.
 */
export type AppErrorCode
  = | 'VALIDATION_ERROR'
    | 'UNAUTHENTICATED'
    | 'INVALID_CREDENTIALS'
    | 'FORBIDDEN_ROLE'
    | 'FORBIDDEN_ORIGIN'
    | 'NOT_FOUND'
    | 'TOKEN_INVALID'
    | 'CONFLICT'
    | 'SLUG_TAKEN'
    | 'ALREADY_MEMBER'
    | 'LAST_OWNER'
    | 'RATE_LIMITED'

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', 404, `${what} not found`)

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Postgres unique_violation, optionally for a specific constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error)
  return pgError?.code === '23505' && (!constraint || pgError.constraint_name === constraint)
}

interface PgErrorLike { code?: string, constraint_name?: string }

/** Drizzle wraps driver errors in `cause`; walk the chain to find the Postgres error. */
function findPgError(error: unknown): PgErrorLike | undefined {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'object' && 'code' in current && typeof (current as PgErrorLike).code === 'string')
      return current as PgErrorLike
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
