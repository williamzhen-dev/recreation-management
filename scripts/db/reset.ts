/** pnpm db:reset — drop everything in the LOCAL dev database, migrate, and seed. */
import postgres from 'postgres'
import { migrateDatabase } from '../../server/db/migrate'
import { createCliContext, loadEnv, requireEnv, runCli } from '../_cli'
import { assertLocalDatabase, ensureDatabaseExists } from './local-guard'
import { seed } from './seed'

runCli(async () => {
  loadEnv()
  const url = requireEnv('NUXT_DATABASE_URL')
  assertLocalDatabase(url)
  await ensureDatabaseExists(url)

  const client = postgres(url, { max: 1, onnotice: false })
  try {
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  }
  finally {
    await client.end()
  }
  console.log('Dropped all tables.')

  await migrateDatabase(url)
  console.log('Migrations applied.')

  const ctx = createCliContext(url)
  try {
    await seed(ctx)
  }
  finally {
    await ctx.close()
  }
})
