'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { GuestShell } from '@/components/auth/guest-shell'
import { PasswordInput } from '@/components/auth/password-input'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

function LoginForm() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('confirmed') === '1') {
      setInfo('Email đã được xác nhận. Bạn có thể đăng nhập.')
    }
    const err = searchParams.get('error')
    if (err === 'invalid_or_expired') {
      setError('Link xác nhận không hợp lệ hoặc đã hết hạn.')
    } else if (err === 'oauth_denied' || err === 'oauth_failed') {
      setError('Đăng nhập Google thất bại. Vui lòng thử lại.')
    } else if (err === 'oauth_unavailable') {
      setError('Google OAuth chưa được cấu hình trên server.')
    } else if (err === 'confirm_failed') {
      setError('Không xác nhận được email. Vui lòng thử lại.')
    }
  }, [searchParams])

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
      setError(data.error ?? 'Đăng nhập thất bại')
      setLoading(false)
      return
    }

    if (data.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/documents')
    }
    router.refresh()
  }

  return (
    <div className="guest-card relative overflow-hidden rounded-2xl border border-border/80 bg-background/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(15,23,42,0.18)] p-6 sm:p-7">
      <div className="guest-card-glow pointer-events-none absolute -top-16 right-[-20%] h-40 w-40 rounded-full bg-slate-300/30 blur-3xl" />
      <div className="relative mb-6">
        <h2 className="text-lg font-semibold tracking-tight">Đăng nhập</h2>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier" className="text-xs">
            Tên đăng nhập hoặc email
          </Label>
          <Input
            id="identifier"
            type="text"
            placeholder="username hoặc you@email.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="h-10 bg-background/80"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs">
            Mật khẩu
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
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background/80 px-2 text-muted-foreground">hoặc</span>
        </div>
      </div>

      <GoogleAuthButton>Tiếp tục với Google</GoogleAuthButton>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{' '}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Đăng ký
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <GuestShell>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải…</div>}>
        <LoginForm />
      </Suspense>
    </GuestShell>
  )
}
