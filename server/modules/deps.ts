import type { Db } from '../db/client'

/**
 * Everything a domain service needs from the outside world.
 * Built by the HTTP layer (from runtime config), the CLI (from .env) or tests.
 */
export interface ServiceDeps {
  db: Db
  /** Absolute base URL for links in emails, without a trailing slash. */
  appUrl: string
  now: () => Date
}

export function buildLink(deps: Pick<ServiceDeps, 'appUrl'>, path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, `${deps.appUrl}/`)
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value)
  return url.toString()
}
