/**
 * Single source of truth for what each organization role may do.
 * Handlers check permissions, never role names, so roles can change without touching handlers.
 */
export const ORG_ROLES = ['owner', 'staff'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const PERMISSIONS = [
  'org:read',
  'org:manage',
  'members:manage',
  'facilities:read',
  'facilities:write',
  'resources:write',
  'bookings:read',
  'bookings:write',
  'blocks:write',
  'customers:read',
  'payments:read',
  'payments:write',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const STAFF_PERMISSIONS = [
  'org:read',
  'facilities:read',
  'bookings:read',
  'bookings:write',
  'blocks:write',
  'customers:read',
  'payments:read',
  'payments:write',
] as const satisfies readonly Permission[]

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  staff: STAFF_PERMISSIONS,
}

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export const PLATFORM_ROLES = ['superadmin'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]
