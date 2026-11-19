<script setup lang="ts">
import { Button } from '@/components/ui/button'

const { user, clear } = useUserSession()
const { membership } = useCurrentOrg()

async function signOut() {
  await clear()
  await navigateTo('/auth/login')
}
</script>

<template>
  <div class="min-h-dvh bg-muted/40">
    <header class="border-b bg-background">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <div class="flex min-w-0 items-center gap-4">
          <NuxtLink to="/dashboard" class="truncate font-semibold">
            {{ membership?.organizationName ?? 'Dashboard' }}
          </NuxtLink>
          <nav v-if="membership" class="flex items-center gap-3 text-sm text-muted-foreground">
            <NuxtLink :to="`/dashboard/${membership.organizationSlug}`" class="hover:text-foreground" exact-active-class="text-foreground">
              Overview
            </NuxtLink>
            <NuxtLink
              v-if="membership.role === 'owner'"
              :to="`/dashboard/${membership.organizationSlug}/members`"
              class="hover:text-foreground"
              active-class="text-foreground"
            >
              Team
            </NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted-foreground sm:inline">{{ user?.name }}</span>
          <Button variant="outline" size="sm" @click="signOut">
            Sign out
          </Button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
