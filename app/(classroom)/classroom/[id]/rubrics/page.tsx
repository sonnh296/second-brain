'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { randomUUID } from '@/lib/classroom/uuid-client'

type Rubric = {
  id: string
  name: string
  criteria: { items?: { id: string; label: string; weight?: number; description?: string; max_score?: number }[] }
}

export default function RubricsPage() {
  const { id } = useParams<{ id: string }>()
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [name, setName] = useState('')
  const [labels, setLabels] = useState('Nội dung đúng\nTrình bày rõ\nHoàn thành đúng hạn')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classroom/${id}/rubrics`)
    if (!res.ok) return
    const data = await res.json()
    setRubrics(data.rubrics ?? [])
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    setMsg(null)
    const items = labels
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({
        id: randomUUID(),
        label,
        weight: 1,
        max_score: 10,
      }))
    const res = await fetch(`/api/classroom/${id}/rubrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), criteria: items }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Lỗi')
      return
    }
    setName('')
    await load()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link href={`/classroom/${id}/assignments`} className="text-sm text-muted-foreground hover:underline">
        Bài tập
      </Link>
      <h1 className="text-2xl font-semibold">Tiêu chí chấm điểm</h1>
      <p className="text-sm text-muted-foreground">
        Đặt tên bộ tiêu chí để chọn từ dropdown khi chấm (thủ công hoặc AI).
      </p>

      <div className="rounded-xl border p-4 space-y-3">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Tên bộ tiêu chí (vd: Rubric bài luận)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm"
          rows={4}
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          placeholder="Mỗi dòng một tiêu chí"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void create()}
          className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Tạo tiêu chí
        </button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </div>

      <ul className="space-y-2">
        {rubrics.map((r) => (
          <li key={r.id} className="rounded-xl border p-4">
            <div className="font-medium">{r.name}</div>
            <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5">
              {(r.criteria?.items ?? []).map((c) => (
                <li key={c.id}>{c.label}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
