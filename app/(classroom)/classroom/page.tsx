'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LogIn, GraduationCap, BookOpen, Users, Menu, X } from 'lucide-react'
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

type Section = 'teaching' | 'learning'

function navClass(active: boolean) {
  return `w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
    active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-foreground hover:bg-muted'
  }`
}

export default function ClassroomHomePage() {
  const router = useRouter()
  const [teaching, setTeaching] = useState<ClassRow[]>([])
  const [learning, setLearning] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('teaching')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

  useEffect(() => {
    if (loading) return
    if (section === 'teaching' && teaching.length === 0 && learning.length > 0) {
      setSection('learning')
    } else if (section === 'learning' && learning.length === 0 && teaching.length > 0) {
      setSection('teaching')
    }
  }, [loading, teaching.length, learning.length, section])

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

  const list = section === 'teaching' ? teaching : learning
  const emptyLabel =
    section === 'teaching' ? 'Bạn chưa tạo lớp nào' : 'Bạn chưa tham gia lớp nào'

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-2 h-full">
      <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Lớp học
      </p>
      <button
        type="button"
        className={navClass(section === 'teaching')}
        onClick={() => {
          setSection('teaching')
          setSidebarOpen(false)
        }}
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        Lớp của tôi
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {teaching.length}
        </span>
      </button>
      <button
        type="button"
        className={navClass(section === 'learning')}
        onClick={() => {
          setSection('learning')
          setSidebarOpen(false)
        }}
      >
        <Users className="h-4 w-4 shrink-0" />
        Lớp tham gia
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {learning.length}
        </span>
      </button>
    </nav>
  )

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 border-b px-3 sm:px-4 py-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="md:hidden p-2 rounded-md hover:bg-muted shrink-0 -ml-1"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <h1 className="text-base font-semibold tracking-tight">
          {section === 'teaching' ? 'Lớp của tôi' : 'Lớp tham gia'}
        </h1>
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

      <div className="flex-1 min-h-0 flex relative">
        {sidebarOpen && (
          <button
            type="button"
            className="md:hidden absolute inset-0 z-10 bg-black/20"
            aria-label="Đóng"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`shrink-0 border-r bg-background z-20 w-52 ${
            sidebarOpen
              ? 'absolute inset-y-0 left-0 shadow-lg md:static md:shadow-none'
              : 'hidden md:block'
          }`}
        >
          {sidebar}
        </aside>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {loading ? (
            <p className="text-xs text-muted-foreground">Đang tải...</p>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <GraduationCap className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {section === 'teaching'
                  ? 'Tạo lớp mới để bắt đầu giảng dạy.'
                  : 'Nhập mã lớp từ giáo viên để tham gia.'}
              </p>
              <div className="flex gap-2 mt-1">
                {section === 'teaching' ? (
                  <Button type="button" variant="outline" size="sm" onClick={openCreate}>
                    Tạo lớp
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={openJoin}>
                    Vào lớp
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {list.map((c) => (
                <Link
                  key={c.id}
                  href={`/classroom/${c.id}`}
                  className="group relative flex flex-col items-center text-center gap-2 rounded-xl border bg-card p-3 hover:shadow-md hover:border-primary/30 transition"
                >
                  <GraduationCap className="h-10 w-10 text-foreground/70" />
                  <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {section === 'teaching' ? (
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
