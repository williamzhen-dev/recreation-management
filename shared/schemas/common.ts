import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const personNameSchema = z.string().trim().min(1).max(120)

export const uuidSchema = z.uuid()

/** Minimum 8 per our baseline; maximum guards argon2 against oversized inputs. */
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128)

/** IANA zone names only (e.g. America/Toronto) — rejects abbreviations like EST. */
export const timezoneSchema = z.string().trim().refine(isIanaTimezone, 'Must be an IANA time zone such as America/Toronto')

export function isIanaTimezone(value: string): boolean {
  if (value !== 'UTC' && !value.includes('/'))
    return false
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-CA', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}
