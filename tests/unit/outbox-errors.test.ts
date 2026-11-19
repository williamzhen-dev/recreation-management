/* eslint-disable unicorn/error-message -- these tests deliberately construct errors with empty messages */
import { describe, expect, it } from 'vitest'
import { describeError } from '../../server/modules/notifications/outbox'
import { renderNotification } from '../../server/modules/notifications/templates'

describe('describeError', () => {
  it('unwraps AggregateErrors with empty messages (e.g. SMTP connection refused)', () => {
    const refused = (address: string) => Object.assign(new Error(`connect ECONNREFUSED ${address}`), { code: 'ECONNREFUSED' })
    const error = new AggregateError([
      refused('::1:1025'),
      refused('127.0.0.1:1025'),
    ], '')
    expect(describeError(error)).toBe('connect ECONNREFUSED ::1:1025; connect ECONNREFUSED 127.0.0.1:1025')
  })

  it('falls back to the error code, then the error name', () => {
    expect(describeError(Object.assign(new Error(''), { code: 'ETIMEDOUT' }))).toBe('ETIMEDOUT')
    expect(describeError(new TypeError(''))).toBe('TypeError')
    expect(describeError('plain string')).toBe('plain string')
  })
})

describe('email templates', () => {
  it('escapes user-supplied values in HTML but keeps them readable in text', () => {
    const email = renderNotification('auth.added_to_org', {
      name: '<script>alert(1)</script>',
      organizationName: 'Tom & Jerry\'s Gym',
      role: 'staff',
      loginUrl: 'http://localhost:3000/auth/login',
    })
    expect(email.subject).toBe('You\'ve been added to Tom & Jerry\'s Gym')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).toContain('Tom &amp; Jerry&#39;s Gym')
    expect(email.text).toContain('Hi <script>alert(1)</script>,')
  })

  it('formats setup-link expiry in Toronto time', () => {
    const email = renderNotification('auth.setup', {
      name: 'Jamie',
      organizationName: 'Maple Sports',
      role: 'owner',
      link: 'http://localhost:3000/auth/set-password?token=abc',
      expiresAt: '2026-11-25T17:30:00.000Z',
    })
    expect(email.subject).toBe('Set up your Maple Sports account')
    expect(email.text).toContain('Nov 25, 2026, 12:30 p.m. EST')
  })
})
