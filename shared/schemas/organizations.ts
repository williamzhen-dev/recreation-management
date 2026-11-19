import { z } from 'zod'
import { ORG_ROLES } from '../auth/permissions'
import { emailSchema, personNameSchema, timezoneSchema } from './common'

/** Paths and names the public portal or the app itself may need. */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'book',
  'booking',
  'bookings',
  'dashboard',
  'help',
  'login',
  'logout',
  'new',
  'settings',
  'setup',
  'signup',
  'status',
  'support',
  'www',
])

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .refine(slug => !RESERVED_SLUGS.has(slug), 'This slug is reserved')

export const organizationNameSchema = z.string().trim().min(2).max(120)

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
    defaultTimezone: timezoneSchema.optional(),
  })
  .refine(value => Object.keys(value).length > 0, 'Nothing to update')
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

export const orgRoleSchema = z.enum(ORG_ROLES)

export const inviteMemberSchema = z.object({
  email: emailSchema,
  name: personNameSchema,
  role: orgRoleSchema,
})
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

export const changeMemberRoleSchema = z.object({
  role: orgRoleSchema,
})

export const provisionOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema,
  timezone: timezoneSchema,
  owner: z.object({
    email: emailSchema,
    name: personNameSchema,
  }),
})
export type ProvisionOrganizationInput = z.infer<typeof provisionOrganizationSchema>
