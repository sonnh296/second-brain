import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { withSessionMaxAge } from '@/lib/auth/session'

/** Node < 22 has no native WebSocket — required by @supabase/realtime-js in workers/scripts. */
function nodeSupabaseOptions(): SupabaseClientOptions<'public'> | undefined {
  if (typeof globalThis.WebSocket !== 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('ws') as typeof import('ws')
  return { realtime: { transport: ws } }
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withSessionMaxAge(options) as typeof options)
            )
          } catch {
            // setAll called from a Server Component — read-only, safe to ignore
          }
        },
      },
    }
  )
}

/** Service-role client for worker — bypasses RLS */
export function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    nodeSupabaseOptions()
  )
}
