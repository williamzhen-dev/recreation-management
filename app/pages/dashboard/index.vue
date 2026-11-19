<script setup lang="ts">
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ middleware: 'auth', layout: 'dashboard' })
useHead({ title: 'Dashboard' })

const { data: me } = await useMe()

// Most users belong to exactly one organization: take them straight there (D1).
if (me.value?.memberships.length === 1)
  await navigateTo(`/dashboard/${me.value.memberships[0]!.organizationSlug}`, { replace: true })
</script>

<template>
  <div class="grid gap-4">
    <h1 class="text-2xl font-semibold">
      Your organizations
    </h1>

    <p v-if="!me?.memberships.length" class="text-muted-foreground">
      <template v-if="me?.user.platformRole === 'superadmin'">
        You're a superadmin without any memberships. The admin area comes in a later slice.
      </template>
      <template v-else>
        You're not a member of any organization yet. Ask an owner to invite you.
      </template>
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <NuxtLink v-for="membership in me?.memberships" :key="membership.organizationId" :to="`/dashboard/${membership.organizationSlug}`">
        <Card class="transition-colors hover:bg-accent">
          <CardHeader>
            <CardTitle>{{ membership.organizationName }}</CardTitle>
            <CardDescription class="capitalize">
              {{ membership.role }}
            </CardDescription>
          </CardHeader>
        </Card>
      </NuxtLink>
    </div>
  </div>
</template>
