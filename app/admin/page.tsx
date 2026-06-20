'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface AdminUser {
  id: string
  username: string
  role: 'user' | 'admin'
  created_at: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function fetchUsers() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      setUsers(await res.json())
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Tạo tài khoản thất bại')
      setCreating(false)
      return
    }

    setSuccess(`Đã tạo tài khoản "${data.username}"`)
    setUsername('')
    setPassword('')
    setRole('user')
    setCreating(false)
    await fetchUsers()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quản lý người dùng</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Thêm tài khoản mới cho người dùng đăng nhập bằng tên đăng nhập.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thêm người dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-username">Tên đăng nhập</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: nguyen_van_a"
                pattern="[a-z0-9_]{3,32}"
                required
              />
              <p className="text-xs text-muted-foreground">3–32 ký tự: chữ thường, số, dấu _</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Mật khẩu</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Vai trò</Label>
              <select
                id="new-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="user">Người dùng</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Button type="submit" disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách người dùng</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có người dùng.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Tên đăng nhập</th>
                    <th className="pb-2 pr-4 font-medium">Vai trò</th>
                    <th className="pb-2 font-medium">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{u.username}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(u.created_at).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
