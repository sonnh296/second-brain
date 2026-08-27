'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LogIn, GraduationCap } from 'lucide-react'

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
    router.push(`/classroom/${d.classroom_id}`)
  }

  const all = [
    ...teaching.map((c) => ({ ...c, section: 'dạy' as const })),
    ...learning.map((c) => ({ ...c, section: 'học' as const })),
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">Lớp học</h1>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setMode(mode === 'create' ? 'none' : 'create')}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Tạo lớp
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'join' ? 'none' : 'join')}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            <LogIn className="h-3.5 w-3.5" /> Vào lớp
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {mode === 'create' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <input
              className="flex-1 min-w-[160px] rounded-md border px-2 py-1.5 text-sm bg-background"
              placeholder="Tên lớp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createClass()}
              autoFocus
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void createClass()}
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Tạo
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <input
              className="flex-1 min-w-[120px] rounded-md border px-2 py-1.5 text-sm bg-background uppercase tracking-widest"
              placeholder="Mã lớp"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && void joinClass()}
              autoFocus
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={() => void joinClass()}
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Vào
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading ? (
          <p className="text-xs text-muted-foreground">Đang tải...</p>
        ) : all.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">Chưa có lớp</p>
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
    </div>
  )
}
