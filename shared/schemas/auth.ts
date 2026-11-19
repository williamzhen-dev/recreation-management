import { z } from 'zod'
import { emailSchema, passwordSchema, personNameSchema } from './common'

export const loginSchema = z.object({
  email: emailSchema,
  // Don't apply the password policy on login: legacy/admin-set passwords must still work.
  password: z.string().min(1).max(128),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const setPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
  name: personNameSchema.optional(),
})
export type SetPasswordInput = z.infer<typeof setPasswordSchema>
