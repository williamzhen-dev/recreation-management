import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['shadcn-nuxt', '@nuxt/eslint', 'nuxt-auth-utils'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui',
  },
  eslint: {
    config: {
      // Let @antfu/eslint-config own the base + stylistic rules
      standalone: false,
    },
  },

  /**
   * Every value is overridable at runtime with NUXT_* environment variables
   * (e.g. NUXT_DATABASE_URL, NUXT_SMTP_HOST, NUXT_PUBLIC_APP_URL). See .env.example.
   */
  runtimeConfig: {
    databaseUrl: '',
    /** Header carrying the real client IP set by the hosting proxy (e.g. do-connecting-ip). Empty = socket address. */
    clientIpHeader: '',
    emailFrom: 'Recreation Booking <no-reply@localhost>',
    smtp: {
      host: '',
      port: 1025,
      secure: false,
      user: '',
      pass: '',
    },
    session: {
      maxAge: 60 * 60 * 24 * 14, // 14 days, extended on each session write
    },
    public: {
      appUrl: 'http://localhost:3000',
    },
  },

  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Deliver due notification outbox rows every minute (D31).
      '* * * * *': ['notifications:deliver'],
    },
  },
})
