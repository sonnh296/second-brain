/** Remember session for 30 days in browser cookies */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30

export function withSessionMaxAge(
  options: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...options,
    maxAge: SESSION_MAX_AGE_SEC,
  }
}
