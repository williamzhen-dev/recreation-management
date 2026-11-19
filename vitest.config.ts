import { defineConfig } from 'vitest/config'

/**
 * Domain services don't import Nuxt, so tests run on plain Node against a real
 * PostgreSQL 18 database (TEST_DATABASE_URL), created and migrated by the global setup.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    // Test files share one database and truncate it between tests, so run files serially.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
