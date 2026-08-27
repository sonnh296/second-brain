'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { GuestShell } from '@/components/auth/guest-shell'
import { PasswordInput } from '@/components/auth/password-input'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function LoginForm() {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('confirmed') === '1') {
      setInfo(t('emailConfirmed'))
    }
    const err = searchParams.get('error')
    if (err === 'invalid_or_expired') {
      setError(t('invalidLink'))
    } else if (err === 'oauth_denied' || err === 'oauth_failed') {
      setError(t('oauthFailed'))
    } else if (err === 'oauth_unavailable') {
      setError(t('oauthUnavailable'))
    } else if (err === 'confirm_failed') {
      setError(t('confirmFailed'))
    } else if (err === 'account_disabled') {
      setError(t('accountDisabled'))
    }
  }, [searchParams, t])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? t('loginFailed'))
      setLoading(false)
      return
    }

    if (data.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/home')
    }
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-6 sm:p-7 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">{t('login')}</h2>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier" className="text-xs">
            {t('identifier')}
          </Label>
          <Input
            id="identifier"
            type="text"
            placeholder={t('identifierPlaceholder')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="h-10"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs">
            {t('password')}
          </Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full h-10" disabled={loading}>
          {loading ? t('loggingIn') : t('login')}
        </Button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">{tc('or')}</span>
        </div>
      </div>

      <GoogleAuthButton>{t('continueGoogle')}</GoogleAuthButton>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t('signup')}
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  const tc = useTranslations('common')
  return (
    <GuestShell>
      <Suspense fallback={<div className="text-sm text-muted-foreground">{tc('loading')}</div>}>
        <LoginForm />
      </Suspense>
    </GuestShell>
  )
}
