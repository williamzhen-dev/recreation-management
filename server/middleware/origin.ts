import { createError, defineEventHandler, getRequestHeader, getRequestURL, useRuntimeConfig } from 'nuxt/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence in depth on top of SameSite=Lax cookies (D12): browsers always send
 * Origin on cross-site mutating requests, so reject any that don't come from this app.
 * Requests without Origin (curl, server-to-server) carry no ambient cookies risk.
 */
export default defineEventHandler((event) => {
  if (SAFE_METHODS.has(event.req.method))
    return
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/'))
    return

  const origin = getRequestHeader(event, 'origin')
  if (!origin)
    return

  const allowed = new Set([url.origin, new URL(useRuntimeConfig().public.appUrl).origin])
  if (!allowed.has(origin)) {
    throw createError({
      status: 403,
      message: 'Cross-origin request rejected',
      data: { code: 'FORBIDDEN_ORIGIN' },
    })
  }
})
