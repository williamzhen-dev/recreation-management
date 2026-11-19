<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Forgot password' })

const email = ref('')
const sent = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  error.value = ''
  pending.value = true
  try {
    const response = await $fetch<{ message: string }>('/api/auth/password/forgot', {
      method: 'POST',
      body: { email: email.value },
    })
    sent.value = response.message
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
    <CardHeader>
      <CardTitle class="text-xl">
        Forgot your password?
      </CardTitle>
      <CardDescription>We'll email you a link to choose a new one.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      <Alert v-if="sent" role="status">
        <AlertDescription>{{ sent }}</AlertDescription>
      </Alert>
      <form v-else class="grid gap-4" @submit.prevent="submit">
        <Alert v-if="error" variant="destructive" role="alert">
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
        <div class="grid gap-2">
          <Label for="email">Email</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <Button type="submit" :disabled="pending">
          {{ pending ? 'Sending…' : 'Send link' }}
        </Button>
      </form>
      <NuxtLink to="/auth/login" class="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to sign in
      </NuxtLink>
    </CardContent>
  </Card>
</template>
