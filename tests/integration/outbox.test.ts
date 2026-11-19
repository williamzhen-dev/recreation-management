import type { Mailer } from '../../server/modules/notifications/mailer'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notificationOutbox } from '../../server/db/schema'
import { createMemoryMailer } from '../../server/modules/notifications/mailer'
import { backoffMs, deliverOutbox, enqueueNotification, MAX_ATTEMPTS } from '../../server/modules/notifications/outbox'
import { useTestContext } from '../helpers/context'

const { deps, db, mailer, advanceClock } = useTestContext()

const failingMailer: Mailer = {
  async send() {
    throw new Error('SMTP unavailable')
  },
}

function enqueueReset(to = 'jamie@example.com', dedupeKey?: string) {
  return enqueueNotification(db, {
    type: 'auth.reset',
    to,
    dedupeKey,
    payload: {
      name: 'Jamie',
      link: 'http://localhost:3000/auth/set-password?token=secret-token',
      expiresAt: new Date().toISOString(),
    },
  })
}

async function row(id: string) {
  const [result] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id))
  return result!
}

describe('notification outbox', () => {
  it('sends due emails and redacts secret links afterwards', async () => {
    const id = (await enqueueReset())!
    const result = await deliverOutbox({ db, mailer, now: deps.now })

    expect(result).toMatchObject({ sent: 1, retried: 0, dead: 0 })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: 'jamie@example.com', subject: 'Reset your password' })
    expect(mailer.sent[0]!.text).toContain('token=secret-token')
    expect(mailer.sent[0]!.html).toContain('href="http://localhost:3000/auth/set-password?token=secret-token"')

    const sent = await row(id)
    expect(sent).toMatchObject({ status: 'sent', attempts: 1, providerMessageId: 'memory-1' })
    expect(sent.payload.link).toBe('[redacted]')
  })

  it('retries with exponential backoff, then gives up as dead', async () => {
    const id = (await enqueueReset())!

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const result = await deliverOutbox({ db, mailer: failingMailer, now: deps.now })
      expect(result.retried).toBe(1)
      const current = await row(id)
      expect(current).toMatchObject({ status: 'pending', attempts: attempt, lastError: 'SMTP unavailable' })

      // Not due again until the backoff has passed.
      expect((await deliverOutbox({ db, mailer: failingMailer, now: deps.now })).retried).toBe(0)
      advanceClock(backoffMs(attempt) + 1000)
    }

    const final = await deliverOutbox({ db, mailer: failingMailer, now: deps.now })
    expect(final.dead).toBe(1)
    expect(await row(id)).toMatchObject({ status: 'dead', attempts: MAX_ATTEMPTS })
  })

  it('ignores a duplicate dedupe key', async () => {
    expect(await enqueueReset('a@example.com', 'booking-1:confirmed')).toBeTruthy()
    expect(await enqueueReset('a@example.com', 'booking-1:confirmed')).toBeNull()
    expect(await db.select().from(notificationOutbox)).toHaveLength(1)
  })

  it('never sends the same email twice when workers run concurrently', async () => {
    for (let i = 0; i < 10; i++)
      await enqueueReset(`user${i}@example.com`)

    const slowMailer = createMemoryMailer()
    const original = slowMailer.send
    slowMailer.send = async (message) => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return original(message)
    }

    const results = await Promise.all([
      deliverOutbox({ db, mailer: slowMailer, now: deps.now }),
      deliverOutbox({ db, mailer: slowMailer, now: deps.now }),
      deliverOutbox({ db, mailer: slowMailer, now: deps.now }),
    ])
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(10)
    expect(slowMailer.sent).toHaveLength(10)
    expect(new Set(slowMailer.sent.map(m => m.to)).size).toBe(10)
  })

  it('reclaims rows stuck in "sending" after the lock expires (crashed worker)', async () => {
    const id = (await enqueueReset())!
    await db.update(notificationOutbox).set({
      status: 'sending',
      lockedUntil: new Date(deps.now().getTime() + 60_000),
      attempts: 1,
    }).where(eq(notificationOutbox.id, id))

    expect((await deliverOutbox({ db, mailer, now: deps.now })).sent).toBe(0)
    advanceClock(2 * 60_000)
    expect((await deliverOutbox({ db, mailer, now: deps.now })).sent).toBe(1)
  })

  it('only delivers the requested ids when given', async () => {
    const a = (await enqueueReset('a@example.com'))!
    await enqueueReset('b@example.com')
    await deliverOutbox({ db, mailer, now: deps.now }, {
      ids: [a],
    })
    expect(mailer.sent.map(m => m.to)).toEqual(['a@example.com'])
  })
})
