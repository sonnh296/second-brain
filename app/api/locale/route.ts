import { NextRequest, NextResponse } from 'next/server'
import { defaultLocale, isAppLocale, LOCALE_COOKIE } from '@/i18n/config'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const locale = isAppLocale(body?.locale) ? body.locale : defaultLocale

  const res = NextResponse.json({ ok: true, locale })
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return res
}
