import type { NextRequest } from 'next/server'

/**
 * Canonical app origin for redirects (logout, emails, etc.).
 * Set NEXT_PUBLIC_APP_URL in production (e.g. https://brain.example.com).
 * Falls back to proxy headers, then request origin.
 */
export function getAppOrigin(req?: NextRequest): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }

  if (req) {
    const forwardedHost = req.headers.get('x-forwarded-host')
    const host = forwardedHost ?? req.headers.get('host')
    if (host) {
      const proto =
        req.headers.get('x-forwarded-proto') ??
        (host.includes('localhost') ? 'http' : 'https')
      return `${proto}://${host}`
    }
    return new URL(req.url).origin
  }

  return 'http://localhost:3000'
}

export function appUrl(path: string, req?: NextRequest): URL {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return new URL(normalized, getAppOrigin(req))
}
