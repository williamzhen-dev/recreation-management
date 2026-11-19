interface ApiErrorBody {
  message?: string
  data?: { code?: string, details?: { issues?: { path: string, message: string }[] } }
}

/** Turn a $fetch error into a message for the user, following the API error contract. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const body = (error as { data?: ApiErrorBody } | null)?.data
  const issue = body?.data?.details?.issues?.[0]
  if (issue)
    return issue.message
  return body?.message || fallback
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as { data?: ApiErrorBody } | null)?.data?.data?.code
}
