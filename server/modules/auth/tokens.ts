import type { DbOrTx } from '../../db/client'
import type { AuthToken, AuthTokenPurpose } from '../../db/schema'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import { authTokens } from '../../db/schema'
import { generateToken, sha256 } from '../../lib/crypto'
import { AppError } from '../../lib/errors'

export const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  setup: 7 * 24 * 60 * 60_000,
  reset: 60 * 60_000,
  verify_email: 24 * 60 * 60_000,
}

export interface IssuedToken {
  token: string
  expiresAt: Date
}

/**
 * Issue a single-use token. Any earlier unused token with the same purpose for this
 * user is invalidated, so only the newest link works.
 */
export async function issueToken(
  tx: DbOrTx,
  input: { userId: string, purpose: AuthTokenPurpose, organizationId?: string | null, now: Date },
): Promise<IssuedToken> {
  await tx
    .update(authTokens)
    .set({ expiresAt: input.now })
    .where(and(
      eq(authTokens.userId, input.userId),
      eq(authTokens.purpose, input.purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, input.now),
    ))

  const token = generateToken()
  const expiresAt = new Date(input.now.getTime() + TOKEN_TTL_MS[input.purpose])
  await tx.insert(authTokens).values({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    purpose: input.purpose,
    tokenHash: sha256(token),
    expiresAt,
  })
  return { token, expiresAt }
}

const invalidToken = () => new AppError('TOKEN_INVALID', 404, 'This link is invalid or has expired')

/** Look up a usable token without consuming it (for the "set password" page pre-check). */
export async function findUsableToken(
  db: DbOrTx,
  token: string,
  purposes: AuthTokenPurpose[],
  now: Date,
): Promise<AuthToken> {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      inArray(authTokens.purpose, purposes),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, now),
    ))
    .limit(1)
  if (!row)
    throw invalidToken()
  return row
}

/** Atomically mark a token used. A concurrent second use finds nothing and fails. */
export async function consumeToken(
  tx: DbOrTx,
  token: string,
  purposes: AuthTokenPurpose[],
  now: Date,
): Promise<AuthToken> {
  const [row] = await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(
      eq(authTokens.tokenHash, sha256(token)),
      inArray(authTokens.purpose, purposes),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, now),
    ))
    .returning()
  if (!row)
    throw invalidToken()
  return row
}
