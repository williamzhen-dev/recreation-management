<script setup lang="ts">
const { loggedIn } = useUserSession()
await navigateTo(loggedIn.value ? '/dashboard' : '/auth/login', { replace: true })
</script>

<template>
  <div />
</template>
