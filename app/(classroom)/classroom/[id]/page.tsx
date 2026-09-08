'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Folder, Plus } from 'lucide-react'
import { ClassroomLoading, ClassroomTileSkeleton } from '@/components/classroom/classroom-loading'

type Lesson = { id: string; lesson_index: number; title: string }

const TILE =
  'w-[7.25rem] sm:w-[7.5rem] flex flex-col items-center text-center gap-1.5 rounded-lg border p-2.5 hover:bg-muted/50 transition'

export default function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/classroom/${id}`)
    if (!res.ok) {
      setError('Không tải được lớp')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRole(data.role)
    setLessons(data.lessons ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function addLesson() {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/classroom/${id}/lessons`, { method: 'POST' })
    setBusy(false)
    if (res.ok) {
      const lesson = await res.json()
      router.push(`/classroom/${id}/lessons/${lesson.id}`)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không tạo được buổi')
    }
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 space-y-4">
        <ClassroomTileSkeleton count={4} />
        <ClassroomLoading label="Đang tải buổi học..." className="py-8" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {role === 'teacher' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void addLesson()}
            className={`${TILE} border-dashed text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer`}
          >
            <Plus className="h-8 w-8" />
            <p className="text-xs font-medium">{busy ? 'Đang tạo...' : 'Thêm buổi'}</p>
          </button>
        )}
        {lessons.map((l) => (
          <Link key={l.id} href={`/classroom/${id}/lessons/${l.id}`} className={TILE}>
            <Folder className="h-9 w-9 text-sky-600" />
            <p className="text-xs font-medium line-clamp-2 w-full leading-snug">{l.title}</p>
          </Link>
        ))}
      </div>

      {lessons.length === 0 && role === 'student' && (
        <p className="text-sm text-muted-foreground text-center py-8">Chưa có buổi học</p>
      )}
    </div>
  )
}
