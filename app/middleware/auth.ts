/** Pages that need a signed-in operator: `definePageMeta({ middleware: 'auth' })`. */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo({
      path: '/auth/login',
      query: { redirect: to.fullPath },
    })
  }
})
