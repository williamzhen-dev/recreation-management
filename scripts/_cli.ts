import type { ServiceDeps } from '../server/modules/deps'
import type { Mailer } from '../server/modules/notifications/mailer'
import process from 'node:process'
import { createDb } from '../server/db/client'
import { AppError } from '../server/lib/errors'
import { createSmtpMailer } from '../server/modules/notifications/mailer'
import { deliverOutbox } from '../server/modules/notifications/outbox'

/** Load .env (same variables as the app) without a dotenv dependency. */
export function loadEnv(): void {
  try {
    process.loadEnvFile('.env')
  }
  catch {}
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

export interface CliContext {
  deps: ServiceDeps
  mailer: Mailer | null
  close: () => Promise<void>
}

export function createCliContext(databaseUrl = requireEnv('NUXT_DATABASE_URL')): CliContext {
  const { db, close } = createDb(databaseUrl, { max: 3 })
  const appUrl = (process.env.NUXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const smtpHost = process.env.NUXT_SMTP_HOST
  const mailer = smtpHost
    ? createSmtpMailer({
        host: smtpHost,
        port: Number(process.env.NUXT_SMTP_PORT ?? 1025),
        secure: process.env.NUXT_SMTP_SECURE === 'true',
        user: process.env.NUXT_SMTP_USER || undefined,
        pass: process.env.NUXT_SMTP_PASS || undefined,
        from: process.env.NUXT_EMAIL_FROM ?? 'Recreation Booking <no-reply@localhost>',
      })
    : null
  return {
    deps: {
      db,
      appUrl,
      now: () => new Date(),
    },
    mailer,
    close,
  }
}

/** Try to send queued emails now; if SMTP isn't configured or fails, the app's scheduled task retries. */
export async function deliverNow(ctx: CliContext, ids: string[]): Promise<void> {
  if (ids.length === 0)
    return
  if (!ctx.mailer) {
    console.log('  (NUXT_SMTP_HOST not set — email queued; the running app will send it)')
    return
  }
  const result = await deliverOutbox({ db: ctx.deps.db, mailer: ctx.mailer, now: ctx.deps.now }, { ids })
  if (result.sent)
    console.log(`  Email sent (${result.sent}).`)
  for (const failure of result.errors)
    console.warn(`  Email not sent yet (${failure.error}); it will be retried by the app.`)
}

/** Run a CLI main function with friendly error output and a clean exit. */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main()
    process.exit(0)
  }
  catch (error) {
    if (error instanceof AppError) {
      console.error(`Error: ${error.message}`)
      if (error.details)
        console.error(JSON.stringify(error.details, null, 2))
    }
    else {
      console.error(error)
    }
    process.exit(1)
  }
}
