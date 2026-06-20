const INTERNAL_EMAIL_DOMAIN = 'users.secondbrain.local'

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(normalizeUsername(username))
}
