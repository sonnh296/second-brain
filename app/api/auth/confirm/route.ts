import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/db/server'
import { consumeEmailVerification } from '@/lib/auth/email-verification'
import { logger } from '@/lib/logger'

function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || req.nextUrl.origin
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  const loginUrl = new URL('/login', appOrigin(req))

  if (!token) {
    loginUrl.searchParams.set('error', 'missing_token')
    return NextResponse.redirect(loginUrl)
  }

  const service = createServiceSupabaseClient()

  try {
    const verified = await consumeEmailVerification(service, token)
    if (!verified) {
      loginUrl.searchParams.set('error', 'invalid_or_expired')
      return NextResponse.redirect(loginUrl)
    }

    const { error } = await service.auth.admin.updateUserById(verified.userId, {
      email_confirm: true,
    })
    if (error) {
      logger.error('Confirm email updateUser failed', {
        err: error,
        userId: verified.userId,
      })
      loginUrl.searchParams.set('error', 'confirm_failed')
      return NextResponse.redirect(loginUrl)
    }

    loginUrl.searchParams.set('confirmed', '1')
    return NextResponse.redirect(loginUrl)
  } catch (err) {
    logger.error('Confirm email failed', { err })
    loginUrl.searchParams.set('error', 'confirm_failed')
    return NextResponse.redirect(loginUrl)
  }
}
