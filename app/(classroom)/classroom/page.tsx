'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LogIn, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClassroomModal } from '@/components/classroom/classroom-modal'

type ClassRow = {
  id: string
  name: string
  join_code: string
  role: 'teacher' | 'student'
  created_at: string
}

export default function ClassroomHomePage() {
  const router = useRouter()
  const [teaching, setTeaching] = useState<ClassRow[]>([])
  const [learning, setLearning] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/classroom')
    if (res.ok) {
      const data = await res.json()
      setTeaching(data.teaching ?? [])
      setLearning(data.learning ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setError(null)
    setName('')
    setMode('create')
  }

  function openJoin() {
    setError(null)
    setCode('')
    setMode('join')
  }

  function closeModal() {
    if (busy) return
    setMode('none')
    setError(null)
  }

  async function createClass() {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/classroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không tạo được lớp')
      return
    }
    const c = await res.json()
    setMode('none')
    router.push(`/classroom/${c.id}`)
  }

  async function joinClass() {
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/classroom/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không tham gia được')
      return
    }
    const d = await res.json()
    setMode('none')
    router.push(`/classroom/${d.classroom_id}`)
  }

  const all = [
    ...teaching.map((c) => ({ ...c, section: 'dạy' as const })),
    ...learning.map((c) => ({ ...c, section: 'học' as const })),
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b px-3 sm:px-4 py-3 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold tracking-tight">Lớp học</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="h-8 gap-1.5 px-3 text-sm border-border bg-background shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Tạo lớp
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openJoin}
            className="h-8 gap-1.5 px-3 text-sm shadow-sm"
          >
            <LogIn className="h-4 w-4" />
            Vào lớp
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Đang tải...</p>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Chưa có lớp</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Tạo lớp mới hoặc nhập mã để vào lớp của giáo viên.
            </p>
            <div className="flex gap-2 mt-1">
              <Button type="button" variant="outline" size="sm" onClick={openCreate}>
                Tạo lớp
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={openJoin}>
                Vào lớp
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {all.map((c) => (
              <Link
                key={c.id}
                href={`/classroom/${c.id}`}
                className="group relative flex flex-col items-center text-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition"
              >
                <GraduationCap className="h-10 w-10 text-foreground/70" />
                <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.section === 'dạy' ? (
                    <span className="font-mono tracking-wider">{c.join_code}</span>
                  ) : (
                    'Học sinh'
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ClassroomModal
        open={mode === 'create'}
        title="Tạo lớp"
        onClose={closeModal}
        busy={busy}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={closeModal} disabled={busy}>
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !name.trim()}
              onClick={() => void createClass()}
            >
              {busy ? 'Đang tạo...' : 'Tạo lớp'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="class-name">Tên lớp</Label>
          <Input
            id="class-name"
            placeholder="Ví dụ: Toán 12A1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createClass()}
            autoFocus
            disabled={busy}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </ClassroomModal>

      <ClassroomModal
        open={mode === 'join'}
        title="Vào lớp"
        onClose={closeModal}
        busy={busy}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={closeModal} disabled={busy}>
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={busy || !code.trim()}
              onClick={() => void joinClass()}
            >
              {busy ? 'Đang vào...' : 'Vào lớp'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="class-code">Mã lớp</Label>
          <Input
            id="class-code"
            placeholder="Nhập mã lớp"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void joinClass()}
            className="uppercase tracking-widest font-mono"
            autoFocus
            disabled={busy}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </ClassroomModal>
    </div>
  )
}
