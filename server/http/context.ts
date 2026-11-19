import type { DbHandle } from '../db/client'
import type { ServiceDeps } from '../modules/deps'
import type { Mailer } from '../modules/notifications/mailer'
import { useRuntimeConfig } from 'nuxt/server'
import { createDb } from '../db/client'
import { createMemoryMailer, createSmtpMailer } from '../modules/notifications/mailer'
import { deliverOutbox } from '../modules/notifications/outbox'

let dbHandle: DbHandle | undefined
let mailer: Mailer | undefined

export function useDb() {
  if (!dbHandle) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl)
      throw new Error('NUXT_DATABASE_URL is not set')
    dbHandle = createDb(databaseUrl)
  }
  return dbHandle.db
}

export function useDeps(): ServiceDeps {
  const config = useRuntimeConfig()
  return {
    db: useDb(),
    appUrl: config.public.appUrl.replace(/\/+$/, ''),
    now: () => new Date(),
  }
}

export function useMailer(): Mailer {
  if (!mailer) {
    const { smtp, emailFrom } = useRuntimeConfig()
    if (smtp.host) {
      mailer = createSmtpMailer({
        host: smtp.host,
        port: Number(smtp.port),
        secure: Boolean(smtp.secure) && String(smtp.secure) !== 'false',
        user: smtp.user || undefined,
        pass: smtp.pass || undefined,
        from: emailFrom,
      })
    }
    else {
      // Development without Mailpit: log emails instead of sending them.
      const memory = createMemoryMailer()
      mailer = {
        async send(message) {
          console.warn(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`)
          return memory.send(message)
        },
      }
    }
  }
  return mailer
}

/**
 * Try to deliver freshly committed outbox rows right away. Not awaited by the request:
 * if it fails, the scheduled `notifications:deliver` task retries (D31).
 */
export function deliverInBackground(ids: string[]): void {
  if (ids.length === 0)
    return
  deliverOutbox({
    db: useDb(),
    mailer: useMailer(),
    now: () => new Date(),
  }, { ids })
    .then((result) => {
      for (const failure of result.errors)
        console.warn(`[outbox] delivery failed id=${failure.id}: ${failure.error}`)
    })
    .catch(error => console.error('[outbox] immediate delivery crashed', error))
}
