export interface Membership {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: 'owner' | 'staff'
}

interface MeResponse {
  user: { id: string, email: string, name: string, platformRole: 'superadmin' | null }
  memberships: Membership[]
}

/** The signed-in user and their memberships (shared across pages under one key). */
export function useMe() {
  return useFetch<MeResponse>('/api/auth/me', { key: 'me' })
}

/** The organization named by the :orgSlug route param, resolved from the user's memberships. */
export function useCurrentOrg() {
  const route = useRoute()
  const me = useMe()
  const membership = computed(() =>
    me.data.value?.memberships.find(m => m.organizationSlug === route.params.orgSlug) ?? null,
  )
  return { ...me, membership }
}
