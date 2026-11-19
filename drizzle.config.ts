import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('.env')
}
catch {}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.NUXT_DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
