import process from 'node:process'
import { useRuntimeConfig } from 'nuxt/server'
import { z } from 'zod'

const productionEnv = z.object({
  databaseUrl: z.string().startsWith('postgres', 'NUXT_DATABASE_URL must be a postgres:// URL'),
  appUrl: z.url('NUXT_PUBLIC_APP_URL must be an absolute URL').startsWith('https://', 'NUXT_PUBLIC_APP_URL must use https in production'),
  smtpHost: z.string().min(1, 'NUXT_SMTP_HOST is required in production'),
  emailFrom: z.string().min(3, 'NUXT_EMAIL_FROM is required in production'),
  appSecret: z.string().min(32, 'NUXT_APP_SECRET must be at least 32 characters'),
})

/** Fail fast at boot when production configuration is missing (never at the first request). */
export default () => {
  const config = useRuntimeConfig()
  if (process.env.NODE_ENV !== 'production') {
    if (process.env.NUXT_APP_SECRET === '')
      console.warn('[env] NUXT_APP_SECRET is set but empty — remove the line (Nuxt generates one in dev) or set 32+ characters')
    if (!config.databaseUrl)
      console.warn('[env] NUXT_DATABASE_URL is not set — copy .env.example to .env')
    if (!config.smtp.host)
      console.warn('[env] NUXT_SMTP_HOST is not set — emails will be printed to the console')
    return
  }

  const result = productionEnv.safeParse({
    databaseUrl: config.databaseUrl,
    appUrl: config.public.appUrl,
    smtpHost: config.smtp.host,
    emailFrom: config.emailFrom,
    appSecret: process.env.NUXT_APP_SECRET ?? '',
  })
  if (!result.success) {
    const problems = result.error.issues.map(issue => `  - ${issue.message}`).join('\n')
    throw new Error(`Invalid production configuration:\n${problems}`)
  }
}
