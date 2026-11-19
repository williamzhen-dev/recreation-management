<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ middleware: 'auth', layout: 'dashboard' })
useHead({ title: 'Team' })

interface Member {
  userId: string
  email: string
  name: string
  role: 'owner' | 'staff'
  setupPending: boolean
}

const { membership, data: me } = useCurrentOrg()
const orgId = computed(() => membership.value?.organizationId)
const { data, refresh, error: loadError } = await useFetch<{ members: Member[] }>(() => `/api/orgs/${orgId.value}/members`, {
  immediate: Boolean(orgId.value),
  watch: [orgId],
})

const notice = ref('')
const error = ref('')
const invite = reactive({ email: '', name: '', role: 'staff' as Member['role'] })
const inviting = ref(false)

async function run(action: () => Promise<unknown>, success: string) {
  error.value = ''
  notice.value = ''
  try {
    await action()
    notice.value = success
    await refresh()
  }
  catch (err) {
    error.value = apiErrorMessage(err)
  }
}

async function sendInvite() {
  inviting.value = true
  await run(
    () => $fetch<unknown>(`/api/orgs/${orgId.value}/members`, {
      method: 'POST',
      body: { ...invite },
    }),
    `Invitation sent to ${invite.email}.`,
  )
  if (!error.value)
    Object.assign(invite, { email: '', name: '', role: 'staff' })
  inviting.value = false
}

function changeRole(member: Member, role: Member['role']) {
  return run(
    () => $fetch<unknown>(`/api/orgs/${orgId.value}/members/${member.userId}`, {
      method: 'PATCH',
      body: { role },
    }),
    `${member.name} is now ${role === 'owner'
      ? 'an owner'
      : 'staff'}.`,
  )
}

function remove(member: Member) {
  // eslint-disable-next-line no-alert -- a native confirm is enough for the MVP
  if (!window.confirm(`Remove ${member.name} from this organization?`))
    return
  return run(
    () => $fetch<unknown>(`/api/orgs/${orgId.value}/members/${member.userId}`, { method: 'DELETE' }),
    `${member.name} was removed.`,
  )
}

function resend(member: Member) {
  return run(
    () => $fetch<unknown>(`/api/orgs/${orgId.value}/members/${member.userId}/resend`, { method: 'POST' }),
    `A new setup link was sent to ${member.email}.`,
  )
}
</script>

<template>
  <div class="grid gap-6">
    <h1 class="text-2xl font-semibold">
      Team
    </h1>

    <Alert v-if="loadError" variant="destructive">
      <AlertDescription>{{ apiErrorMessage(loadError) }}</AlertDescription>
    </Alert>
    <Alert v-if="error" variant="destructive" role="alert">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>
    <Alert v-if="notice" role="status">
      <AlertDescription>{{ notice }}</AlertDescription>
    </Alert>

    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>They'll get an email to set up their account, or a sign-in link if they already have one.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" @submit.prevent="sendInvite">
          <div class="grid gap-2">
            <Label for="invite-name">Name</Label>
            <Input id="invite-name" v-model="invite.name" autocomplete="off" required />
          </div>
          <div class="grid gap-2">
            <Label for="invite-email">Email</Label>
            <Input id="invite-email" v-model="invite.email" type="email" autocomplete="off" required />
          </div>
          <div class="grid gap-2">
            <Label for="invite-role">Role</Label>
            <select id="invite-role" v-model="invite.role" class="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
              <option value="staff">
                Staff
              </option>
              <option value="owner">
                Owner
              </option>
            </select>
          </div>
          <Button type="submit" :disabled="inviting">
            {{ inviting ? 'Sending…' : 'Send invite' }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>Owners manage settings and the team. Staff run day-to-day bookings.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="divide-y">
          <li v-for="member in data?.members" :key="member.userId" class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ member.name }}</span>
                <Badge v-if="member.setupPending" variant="outline">
                  Invite pending
                </Badge>
                <Badge v-if="member.userId === me?.user.id" variant="secondary">
                  You
                </Badge>
              </div>
              <div class="truncate text-sm text-muted-foreground">
                {{ member.email }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <label :for="`role-${member.userId}`" class="sr-only">Role for {{ member.name }}</label>
              <select
                :id="`role-${member.userId}`"
                :value="member.role"
                class="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                @change="changeRole(member, ($event.target as HTMLSelectElement).value as Member['role'])"
              >
                <option value="staff">
                  Staff
                </option>
                <option value="owner">
                  Owner
                </option>
              </select>
              <Button v-if="member.setupPending" variant="outline" size="sm" @click="resend(member)">
                Resend
              </Button>
              <Button variant="ghost" size="sm" class="text-destructive" @click="remove(member)">
                Remove
              </Button>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
