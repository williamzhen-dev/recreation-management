<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })

interface TokenInfo {
  purpose: 'setup' | 'reset'
  email: string
  name: string
  organizationName: string | null
}

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string'
  ? route.query.token
  : ''))
const { fetch: refreshSession } = useUserSession()

const { data: info, error: tokenError } = await useFetch<TokenInfo>(() => `/api/auth/token/${encodeURIComponent(token.value)}`, {
  immediate: Boolean(token.value),
})
const isSetup = computed(() => info.value?.purpose === 'setup')
useHead({
  title: () => (isSetup.value ? 'Set up your account' : 'Choose a new password'),
})

const name = ref('')
watchEffect(() => {
  if (info.value && !name.value)
    name.value = info.value.name
})
const password = ref('')
const confirm = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'The passwords don\'t match.'
    return
  }
  pending.value = true
  try {
    await $fetch('/api/auth/password/set', {
      method: 'POST',
      body: {
        token: token.value,
        password: password.value,
        ...(isSetup.value
          ? { name: name.value }
          : {}),
      },
    })
    await refreshSession()
    await navigateTo('/dashboard')
  }
  catch (err) {
    error.value = apiErrorMessage(err)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Card>
    <template v-if="!token || tokenError">
      <CardHeader>
        <CardTitle class="text-xl">
          This link has expired
        </CardTitle>
        <CardDescription>Links work once and expire after a while. Request a new one and we'll email it to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child class="w-full">
          <NuxtLink to="/auth/forgot-password">
            Send me a new link
          </NuxtLink>
        </Button>
      </CardContent>
    </template>

    <template v-else-if="info">
      <CardHeader>
        <CardTitle class="text-xl">
          {{ isSetup ? 'Set up your account' : 'Choose a new password' }}
        </CardTitle>
        <CardDescription>
          <template v-if="isSetup && info.organizationName">
            You've been invited to {{ info.organizationName }}.
          </template>
          Signing in as <span class="font-medium text-foreground">{{ info.email }}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="submit">
          <Alert v-if="error" variant="destructive" role="alert">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
          <div v-if="isSetup" class="grid gap-2">
            <Label for="name">Your name</Label>
            <Input id="name" v-model="name" autocomplete="name" required />
          </div>
          <div class="grid gap-2">
            <Label for="password">Password</Label>
            <Input id="password" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
            <p class="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="confirm">Confirm password</Label>
            <Input id="confirm" v-model="confirm" type="password" autocomplete="new-password" required />
          </div>
          <Button type="submit" :disabled="pending">
            {{ pending ? 'Saving…' : isSetup ? 'Create account' : 'Save password' }}
          </Button>
        </form>
      </CardContent>
    </template>
  </Card>
</template>
