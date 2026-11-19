import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

/** Apply all pending migrations. Requires PostgreSQL 18+ (native uuidv7(), D40). */
export async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: false })
  try {
    const [row] = await client<{ server_version_num: string }[]>`show server_version_num`
    const version = Number(row?.server_version_num)
    if (version < 180000)
      throw new Error(`PostgreSQL 18+ is required (found server_version_num=${version})`)
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
  }
  finally {
    await client.end({ timeout: 5 })
  }
}
