import process from 'node:process'
import postgres from 'postgres'

const LOCAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]

export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.includes(new URL(url).hostname)
}

/** Destructive dev scripts refuse to run against anything but a local database. */
export function assertLocalDatabase(url: string): void {
  if (process.env.NODE_ENV === 'production' || !isLocalDatabase(url)) {
    console.error(`Refusing to run against non-local database host "${new URL(url).hostname}".`)
    process.exit(1)
  }
}

/** Create the database named in `url` if it doesn't exist (local development and tests only). */
export async function ensureDatabaseExists(url: string): Promise<boolean> {
  const target = new URL(url)
  const name = decodeURIComponent(target.pathname.slice(1))
  if (!/^\w+$/.test(name))
    throw new Error(`Unexpected database name "${name}"`)

  const admin = new URL(url)
  admin.pathname = '/postgres'
  const client = postgres(admin.toString(), { max: 1, onnotice: false })
  try {
    const [existing] = await client`select 1 from pg_database where datname = ${name}`
    if (existing)
      return false
    await client.unsafe(`create database "${name}"`)
    return true
  }
  finally {
    await client.end()
  }
}
