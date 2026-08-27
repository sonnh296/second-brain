'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { BookOpen, Plus, Upload } from 'lucide-react'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'

type ReviewSet = {
  id: string
  title: string
  set_type: string
  status: string
}

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

export default function ReviewHubPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [sets, setSets] = useState<ReviewSet[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classroom/${id}/review`)
    if (!res.ok) return
    const data = await res.json()
    setRole(data.role)
    setSets(data.sets ?? [])
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function createSet() {
    if (!title.trim() || busy) return
    setBusy(true)
    const res = await fetch(`/api/classroom/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), set_type: 'flashcard' }),
    })
    setBusy(false)
    if (!res.ok) return
    const set = await res.json()
    router.push(`/classroom/${id}/review/${set.id}`)
  }

  async function importFile(file: File) {
    setBusy(true)
    setMsg(null)
    setShowAddMenu(false)
    try {
      const presign = await fetch(`/api/classroom/${id}/review/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size, title: file.name }),
      })
      if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error)
      const p = await presign.json()
      await putToR2WithProgress(p.upload_url, file, p.content_type, () => {})
      const done = await fetch(`/api/classroom/${id}/review/import`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: p.job_id, title: p.title }),
      })
      if (!done.ok) throw new Error((await done.json().catch(() => ({}))).error)
      const d = await done.json()
      router.push(`/classroom/${id}/review/${d.set.id}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import thất bại')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {showCreate && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 max-w-lg">
          <input
            className="flex-1 min-w-[140px] rounded-md border px-3 py-2 text-sm"
            placeholder="Tên bộ ôn"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createSet()}
            autoFocus
          />
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void createSet()}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Tạo
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-sm text-muted-foreground px-2"
          >
            Hủy
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex flex-wrap gap-3 relative">
        {role === 'teacher' && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.target.value = ''
              }}
            />
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu((v) => !v)}
                className={`${TILE} border-dashed text-muted-foreground hover:text-foreground cursor-pointer`}
              >
                <Plus className="h-8 w-8" />
                <p className="text-xs font-medium">Thêm mới</p>
              </button>
              {showAddMenu && (
                <div className="absolute left-0 top-full mt-1 z-10 w-44 rounded-lg border bg-popover shadow-md py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setShowAddMenu(false)
                      setShowCreate(true)
                    }}
                  >
                    Tạo flashcard
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Import file
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {sets.map((s) => (
          <Link key={s.id} href={`/classroom/${id}/review/${s.id}`} className={TILE}>
            <BookOpen className="h-9 w-9 text-foreground/70" />
            <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{s.title}</p>
            <p className="text-[10px] text-muted-foreground">{s.status}</p>
          </Link>
        ))}
      </div>

      {sets.length === 0 && !showCreate && (
        <p className="text-sm text-muted-foreground">Chưa có bộ ôn tập</p>
      )}
    </div>
  )
}
