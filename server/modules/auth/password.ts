import { hash, verify } from '@node-rs/argon2'

/** argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum; inlined to avoid importing it)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  }
  catch {
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Spend the same time as a real verification when the account doesn't exist or has
 * no password yet, so response timing doesn't reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  await verifyPassword(await dummyHash, password)
  return false
}
