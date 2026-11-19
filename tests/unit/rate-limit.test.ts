import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../server/lib/rate-limit'
import { ROLE_PERMISSIONS, roleHasPermission } from '../../shared/auth/permissions'

describe('rateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let now = 0
    const limiter = new RateLimiter(2, 1000, () => now)
    expect(limiter.hit('a').allowed).toBe(true)
    expect(limiter.hit('a').allowed).toBe(true)
    expect(limiter.hit('a')).toMatchObject({ allowed: false, retryAfterSeconds: 1 })
    expect(limiter.hit('b').allowed).toBe(true)

    now = 1000
    expect(limiter.hit('a').allowed).toBe(true)
  })

  it('can be reset for a key', () => {
    const limiter = new RateLimiter(1, 60_000)
    limiter.hit('a')
    expect(limiter.hit('a').allowed).toBe(false)
    limiter.reset('a')
    expect(limiter.hit('a').allowed).toBe(true)
  })
})

describe('role permissions', () => {
  it('gives owners every permission and keeps staff out of setup and member management', () => {
    expect(roleHasPermission('owner', 'members:manage')).toBe(true)
    expect(roleHasPermission('staff', 'members:manage')).toBe(false)
    expect(roleHasPermission('staff', 'org:manage')).toBe(false)
    expect(roleHasPermission('staff', 'resources:write')).toBe(false)
    expect(roleHasPermission('staff', 'bookings:write')).toBe(true)
    expect(ROLE_PERMISSIONS.staff.every(p => ROLE_PERMISSIONS.owner.includes(p))).toBe(true)
  })
})
