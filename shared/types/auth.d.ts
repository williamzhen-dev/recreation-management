// Session shape for nuxt-auth-utils. Only identifiers and display data live in the
// (sealed) cookie; authorization always re-reads the database.
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    platformRole: 'superadmin' | null
  }

  interface UserSession {
    loggedInAt?: string
  }

  interface SecureSessionData {
    /** Must equal users.session_version, or the session is treated as revoked (D7). */
    sessionVersion: number
  }
}

export {}
