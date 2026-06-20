/** Verify bearer token or x-health-secret header for deep health checks. */
export function verifyHealthCheckSecret(req: Request): boolean {
  const secret = process.env.HEALTH_CHECK_SECRET
  if (!secret) return false

  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  const headerSecret = req.headers.get('x-health-secret')
  return headerSecret === secret
}

export function isDeepHealthConfigured(): boolean {
  return !!process.env.HEALTH_CHECK_SECRET?.trim()
}
