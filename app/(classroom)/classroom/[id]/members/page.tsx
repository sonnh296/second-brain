'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import { Button } from '@/components/ui/button'

type Member = {
  user_id: string
  role: 'teacher' | 'student'
  joined_at: string
  username: string | null
}

function formatJoinedAt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function ClassroomMembersPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [className, setClassName] = useState('')
  const [students, setStudents] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/classroom/${id}`)
    if (!res.ok) {
      setError('Không tải được danh sách học sinh')
      setLoading(false)
      return
    }
    const data = await res.json()
    if (data.role !== 'teacher') {
      router.replace(`/classroom/${id}`)
      return
    }
    setClassName(data.classroom?.name ?? '')
    const list = ((data.members ?? []) as Member[])
      .filter((m) => m.role === 'student')
      .sort((a, b) => {
        const an = (a.username ?? a.user_id).toLowerCase()
        const bn = (b.username ?? b.user_id).toLowerCase()
        return an.localeCompare(bn, 'vi')
      })
    setStudents(list)
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    void load()
  }, [load])

  async function removeStudent(userId: string, label: string) {
    if (!confirm(`Xóa "${label}" khỏi lớp?`)) return
    setBusyId(userId)
    setError(null)
    const res = await fetch(`/api/classroom/${id}/members?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })
    setBusyId(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Không xóa được học sinh')
      return
    }
    setStudents((prev) => prev.filter((s) => s.user_id !== userId))
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4">
        <ClassroomLoading label="Đang tải học sinh..." className="py-12" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <ClassroomBreadcrumb
        items={[
          { label: 'Lớp học', href: '/classroom' },
          { label: className || 'Lớp', href: `/classroom/${id}` },
          { label: 'Quản lý học sinh' },
        ]}
      />

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Học sinh trong lớp</h2>
        <p className="text-sm text-muted-foreground">{students.length} học sinh</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Chưa có học sinh trong lớp. Chia sẻ mã lớp để học sinh tham gia.
        </p>
      ) : (
        <ul className="rounded-lg border divide-y">
          {students.map((s) => {
            const label = s.username ?? s.user_id.slice(0, 8)
            return (
              <li key={s.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{label}</p>
                  {s.joined_at && (
                    <p className="text-xs text-muted-foreground">
                      Tham gia {formatJoinedAt(s.joined_at)}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  disabled={busyId === s.user_id}
                  onClick={() => void removeStudent(s.user_id, label)}
                >
                  <UserMinus className="h-3.5 w-3.5 mr-1.5" />
                  {busyId === s.user_id ? 'Đang xóa...' : 'Xóa khỏi lớp'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
