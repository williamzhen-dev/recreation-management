<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ middleware: 'auth', layout: 'dashboard' })

const { membership } = useCurrentOrg()
useHead({
  title: () => membership.value?.organizationName ?? 'Dashboard',
})
</script>

<template>
  <div v-if="!membership" class="text-muted-foreground">
    Organization not found.
    <NuxtLink to="/dashboard" class="underline">
      Back to your organizations
    </NuxtLink>
  </div>

  <div v-else class="grid gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">
        {{ membership.organizationName }}
      </h1>
      <Badge variant="secondary" class="capitalize">
        {{ membership.role }}
      </Badge>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Facilities &amp; spaces</CardTitle>
          <CardDescription>Locations, bookable spaces and opening hours.</CardDescription>
        </CardHeader>
        <CardContent class="text-sm text-muted-foreground">
          Coming in the next slice.
        </CardContent>
      </Card>
      <Card v-if="membership.role === 'owner'">
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Invite staff and manage roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <NuxtLink :to="`/dashboard/${membership.organizationSlug}/members`" class="text-sm font-medium underline-offset-4 hover:underline">
            Manage team →
          </NuxtLink>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
