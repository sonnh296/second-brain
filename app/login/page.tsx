'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GuestShell } from '@/components/auth/guest-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
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
    <GuestShell>
      <div className="guest-card relative overflow-hidden rounded-2xl border border-border/80 bg-background/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(15,23,42,0.18)] p-6 sm:p-7">
        <div className="guest-card-glow pointer-events-none absolute -top-16 right-[-20%] h-40 w-40 rounded-full bg-slate-300/30 blur-3xl" />
        <div className="relative mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Đăng nhập</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tiếp tục vào kho dữ liệu và chat của bạn
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-xs">Tên đăng nhập</Label>
            <Input
              id="username"
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="h-10 bg-background/80"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-10 bg-background/80"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </GuestShell>
  )
}
