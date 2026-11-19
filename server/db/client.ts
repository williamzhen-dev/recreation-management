import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PostgresJsDatabase<Schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Services accept either the root database or an open transaction. */
export type DbOrTx = Db | Tx

export interface DbHandle {
  db: Db
  close: () => Promise<void>
}

export interface CreateDbOptions {
  /** Pool size. Keep small: the managed Postgres has a modest connection limit. */
  max?: number
  /** Milliseconds before a single statement is cancelled. */
  statementTimeoutMs?: number
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const client = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    onnotice: false,
    connection: {
      application_name: 'recreation-management',
      statement_timeout: options.statementTimeoutMs ?? 10_000,
      TimeZone: 'UTC',
    },
  })
  const db = drizzle(client, { schema })
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  }
}
