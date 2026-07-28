'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { GuestShell } from '@/components/auth/guest-shell'
import { PasswordInput } from '@/components/auth/password-input'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Đăng ký thất bại')
        return
      }
      setSuccess(
        data.message ??
          'Đã gửi email xác nhận. Vui lòng kiểm tra hộp thư để kích hoạt tài khoản.'
      )
      setPassword('')
      setConfirmPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GuestShell>
      <div className="guest-card relative overflow-hidden rounded-2xl border border-border/80 bg-background/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(15,23,42,0.18)] p-6 sm:p-7">
        <div className="guest-card-glow pointer-events-none absolute -top-16 right-[-20%] h-40 w-40 rounded-full bg-slate-300/30 blur-3xl" />
        <div className="relative mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Đăng ký</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tạo tài khoản Note Everything
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-600 leading-relaxed">{success}</p>
            <Link href="/login" className={buttonVariants({ className: 'w-full h-10' })}>
              Đến trang đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs">
                Tên đăng nhập
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="h-10 bg-background/80"
                required
                minLength={3}
                maxLength={32}
              />
              <p className="text-[11px] text-muted-foreground">
                3–32 ký tự: chữ thường, số, dấu _
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs">
                Xác nhận mật khẩu
              </Label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? 'Đang đăng ký...' : 'Đăng ký'}
            </Button>
          </form>
        )}

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/70" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background/80 px-2 text-muted-foreground">hoặc</span>
          </div>
        </div>

        <GoogleAuthButton>Đăng ký với Google</GoogleAuthButton>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </div>
    </GuestShell>
  )
}
