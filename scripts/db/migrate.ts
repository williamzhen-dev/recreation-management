/** pnpm db:migrate — apply pending migrations to NUXT_DATABASE_URL (or --url). */
import { parseArgs } from 'node:util'
import { migrateDatabase } from '../../server/db/migrate'
import { loadEnv, requireEnv, runCli } from '../_cli'
import { ensureDatabaseExists, isLocalDatabase } from './local-guard'

runCli(async () => {
  loadEnv()
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
    },
  })
  const url = values.url ?? requireEnv('NUXT_DATABASE_URL')
  if (isLocalDatabase(url) && await ensureDatabaseExists(url))
    console.log(`Created database ${new URL(url).pathname.slice(1)}.`)
  await migrateDatabase(url)
  console.log('Migrations applied.')
})
