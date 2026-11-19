import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/** Time-ordered UUID primary key (PostgreSQL 18 native `uuidv7()`). */
export const id = () => uuid('id').primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export function updatedAt() {
  return timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
}

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true })
