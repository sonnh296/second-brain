import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { withSessionMaxAge } from '@/lib/auth/session'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, withSessionMaxAge(options) as typeof options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isProtectedPage =
    pathname.startsWith('/chat') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/admin')
  const isProtectedApi =
    pathname.startsWith('/api/sessions') ||
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/documents') ||
    pathname.startsWith('/api/notes') ||
    pathname.startsWith('/api/tags') ||
    pathname.startsWith('/api/folders') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/auth')

  const isPublicAuthApi =
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/signout' ||
    pathname === '/api/auth/signup' ||
    pathname === '/api/auth/confirm' ||
    pathname === '/api/auth/google'

  if ((isProtectedPage || isProtectedApi) && !isPublicAuthApi && !user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Soft-disabled accounts: sign out and block access mid-session
  if (user && (isProtectedPage || isProtectedApi) && !isPublicAuthApi) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('disabled_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.disabled_at) {
      await supabase.auth.signOut()
      if (isProtectedApi) {
        return NextResponse.json(
          { error: 'Account disabled', code: 'account_disabled' },
          { status: 403 }
        )
      }
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'account_disabled')
      return NextResponse.redirect(loginUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  // Exclude /api/upload — proxy buffers/truncates multipart body causing upload failures
  matcher: [
    '/chat/:path*',
    '/documents/:path*',
    '/profile/:path*',
    '/admin/:path*',
    '/api/sessions/:path*',
    '/api/chat',
    '/api/documents/:path*',
    '/api/notes',
    '/api/tags/:path*',
    '/api/folders/:path*',
    '/api/profile',
    '/api/admin/:path*',
    '/api/auth/:path*',
  ],
}
