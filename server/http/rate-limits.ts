import type { RequestEvent } from 'nuxt/server'
import { getRequestHeader, getRequestIP, useRuntimeConfig } from 'nuxt/server'
import { AppError } from '../lib/errors'
import { RateLimiter } from '../lib/rate-limit'

const MINUTE = 60_000

export const limiters = {
  loginByIp: new RateLimiter(30, 15 * MINUTE),
  loginByEmail: new RateLimiter(10, 15 * MINUTE),
  forgotByIp: new RateLimiter(10, 60 * MINUTE),
  forgotByEmail: new RateLimiter(3, 60 * MINUTE),
  setPasswordByIp: new RateLimiter(20, 15 * MINUTE),
}

/**
 * The client IP. Behind DigitalOcean App Platform, set NUXT_CLIENT_IP_HEADER to the
 * header the proxy controls; X-Forwarded-For's first entry is client-supplied and spoofable.
 */
export function clientIp(event: RequestEvent): string {
  const header = useRuntimeConfig().clientIpHeader
  if (header) {
    const value = getRequestHeader(event, header)
    if (value)
      return value.split(',')[0]!.trim()
  }
  return getRequestIP(event) ?? 'unknown'
}

export function enforceRateLimit(event: RequestEvent, limiter: RateLimiter, key: string): void {
  const result = limiter.hit(key)
  if (!result.allowed) {
    event.res.headers.set('Retry-After', String(result.retryAfterSeconds))
    throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Please try again later.', {
      retryAfterSeconds: result.retryAfterSeconds,
    })
  }
}
