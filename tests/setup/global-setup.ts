import type { TestProject } from 'vitest/node'
import process from 'node:process'
import { ensureDatabaseExists } from '../../scripts/db/local-guard'
import { migrateDatabase } from '../../server/db/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
  }
}

/** Create the test database if needed and bring it to the latest migration. */
export default async function setup(project: TestProject) {
  try {
    process.loadEnvFile('.env')
  }
  catch {}

  const url = process.env.TEST_DATABASE_URL
  if (!url)
    throw new Error('TEST_DATABASE_URL is not set (see .env.example)')

  const databaseName = new URL(url).pathname.slice(1)
  if (!databaseName.includes('test'))
    throw new Error(`Refusing to use "${databaseName}" as the test database: its name must contain "test"`)

  await ensureDatabaseExists(url)
  await migrateDatabase(url)
  project.provide('testDatabaseUrl', url)
}
