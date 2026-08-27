'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'

type Rubric = { id: string; name: string; criteria: { items?: { id: string; label: string }[] } }

type FileMeta = { file_id?: string; filename: string; r2_key?: string }

function gradeOf(
  grades?: { score: number; comment: string | null } | { score: number; comment: string | null }[] | null
) {
  if (!grades) return null
  return Array.isArray(grades) ? grades[0] ?? null : grades
}

function downloadHref(
  classId: string,
  assignmentId: string,
  fileId: string,
  studentId?: string
) {
  const q = new URLSearchParams({ file_id: fileId })
  if (studentId) q.set('student_id', studentId)
  return `/api/classroom/${classId}/assignments/${assignmentId}/download?${q}`
}

export default function AssignmentDetailPage() {
  const { id, assignmentId } = useParams<{ id: string; assignmentId: string }>()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assignment, setAssignment] = useState<{
    title: string
    description: string | null
    max_score: number
  } | null>(null)
  const [submission, setSubmission] = useState<{
    id: string
    files: FileMeta[]
    status: string
    grades?: { score: number; comment: string | null } | { score: number; comment: string | null }[] | null
  } | null>(null)
  const [submissions, setSubmissions] = useState<
    {
      id: string
      student_id: string
      username: string | null
      status: string
      files: FileMeta[]
      grades?: { score: number; comment: string | null } | { score: number; comment: string | null }[] | null
    }[]
  >([])
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [selectedRubric, setSelectedRubric] = useState('')
  const [gradeScore, setGradeScore] = useState('')
  const [gradeComment, setGradeComment] = useState('')
  const [gradingId, setGradingId] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [pendingAiSuggestion, setPendingAiSuggestion] = useState<unknown>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`)
    if (res.status === 403 || res.status === 401) {
      setLoadError('Bạn không có quyền xem bài tập này')
      router.replace(`/classroom/${id}`)
      return
    }
    if (!res.ok) {
      setLoadError('Không tải được bài tập')
      return
    }
    setLoadError(null)
    const data = await res.json()
    setRole(data.role)
    setAssignment(data.assignment)
    if (data.role === 'teacher') {
      setSubmissions(data.submissions ?? [])
      const r = await fetch(`/api/classroom/${id}/rubrics`)
      if (r.ok) {
        const rd = await r.json()
        setRubrics(rd.rubrics ?? [])
      }
    } else {
      setSubmission(data.submission)
    }
  }, [id, assignmentId, router])

  useEffect(() => {
    void load()
  }, [load])

  async function uploadSubmission(file: File) {
    setMsg(null)
    if (file.size > 100 * 1024 * 1024) {
      setMsg('File quá lớn (tối đa 100MB)')
      return
    }
    setProgress(0)
    try {
      const presign = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      })
      if (!presign.ok) {
        const d = await presign.json().catch(() => ({}))
        throw new Error(d.error ?? 'Presign failed')
      }
      const p = await presign.json()
      await putToR2WithProgress(p.upload_url, file, p.content_type, setProgress)
      const submit = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          files: [
            {
              file_id: p.file_id,
              r2_key: p.r2_key,
              filename: p.filename,
              file_type: p.file_type,
              size: p.size,
            },
          ],
        }),
      })
      if (!submit.ok) {
        const d = await submit.json().catch(() => ({}))
        throw new Error(d.error ?? 'Submit failed')
      }
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi')
    } finally {
      setProgress(null)
    }
  }

  async function saveGrade(submissionId: string) {
    setMsg(null)
    const method = pendingAiSuggestion ? 'ai' : 'manual'
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'grade',
        submission_id: submissionId,
        score: Number(gradeScore),
        comment: gradeComment,
        method,
        rubric_id: selectedRubric || null,
        ai_suggestion: pendingAiSuggestion ?? null,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Chấm thất bại')
      return
    }
    setGradingId(null)
    setPendingAiSuggestion(null)
    await load()
  }

  async function runAiGrade(submissionId: string) {
    if (!selectedRubric) {
      setMsg('Chọn tiêu chí chấm trước')
      return
    }
    setAiBusy(true)
    setMsg(null)
    const res = await fetch(`/api/classroom/${id}/grade-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: submissionId, rubric_id: selectedRubric }),
    })
    setAiBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'AI chấm thất bại')
      return
    }
    const data = await res.json()
    const s = data.suggestion as { score?: number; comment?: string }
    if (s?.score != null) setGradeScore(String(s.score))
    if (s?.comment) setGradeComment(s.comment)
    setPendingAiSuggestion(data.suggestion)
    setMsg('AI đã đề xuất điểm — kiểm tra rồi bấm Lưu điểm')
  }

  const myGrade = gradeOf(submission?.grades)

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link
        href={`/classroom/${id}/assignments`}
        className="text-sm text-muted-foreground hover:underline"
      >
        Tất cả bài tập
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{assignment?.title ?? '...'}</h1>
        {assignment?.description && (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
            {assignment.description}
          </p>
        )}
      </div>

      {msg && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}

      {role === 'student' && (
        <section className="rounded-xl border p-4 space-y-3">
          <h2 className="font-medium">Nộp bài của bạn</h2>
          {submission ? (
            <div className="text-sm space-y-1">
              <p>Trạng thái: {submission.status}</p>
              <ul className="space-y-1">
                {(submission.files ?? []).map((f, i) => (
                  <li key={i}>
                    {f.file_id ? (
                      <a
                        href={downloadHref(id, assignmentId, f.file_id)}
                        className="text-sky-700 hover:underline"
                      >
                        {f.filename}
                      </a>
                    ) : (
                      f.filename
                    )}
                  </li>
                ))}
              </ul>
              {myGrade && (
                <p className="mt-2">
                  Điểm: <strong>{myGrade.score}</strong>
                  {myGrade.comment ? ` — ${myGrade.comment}` : ''}
                </p>
              )}
              {submission.status === 'graded' ? (
                <p className="text-xs text-muted-foreground">Bài đã chấm — không thể nộp lại.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Nộp lại sẽ ghi đè bài cũ.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa nộp bài.</p>
          )}
          {submission?.status !== 'graded' && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadSubmission(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={progress !== null}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {progress !== null ? `Đang tải ${progress}%` : 'Chọn file nộp (≤100MB)'}
              </button>
            </>
          )}
        </section>
      )}

      {role === 'teacher' && (
        <section className="space-y-4">
          <div className="rounded-xl border p-4 space-y-2">
            <h2 className="font-medium">Tiêu chí chấm (dropdown)</h2>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={selectedRubric}
              onChange={(e) => setSelectedRubric(e.target.value)}
            >
              <option value="">— Không dùng / chọn tiêu chí —</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Link
              href={`/classroom/${id}/rubrics`}
              className="text-xs text-sky-700 hover:underline"
            >
              Quản lý tiêu chí chấm →
            </Link>
          </div>

          <h2 className="font-medium">Bài nộp học sinh</h2>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có ai nộp.</p>
          ) : (
            <ul className="space-y-3">
              {submissions.map((s) => {
                const g = gradeOf(s.grades)
                return (
                  <li key={s.id} className="rounded-xl border p-4 text-sm space-y-2">
                    <div className="font-medium">
                      {s.username ?? s.student_id.slice(0, 8)} · {s.status}
                      {g ? ` · Điểm ${g.score}` : ''}
                    </div>
                    <ul className="text-muted-foreground space-y-1">
                      {(s.files ?? []).map((f, i) => (
                        <li key={i}>
                          {f.file_id ? (
                            <a
                              href={downloadHref(id, assignmentId, f.file_id, s.student_id)}
                              className="text-sky-700 hover:underline"
                            >
                              Tải: {f.filename}
                            </a>
                          ) : (
                            f.filename
                          )}
                        </li>
                      ))}
                    </ul>
                    {g?.comment && <p className="text-muted-foreground">{g.comment}</p>}
                    {gradingId === s.id ? (
                      <div className="space-y-2 pt-2 border-t">
                        <input
                          type="number"
                          className="w-full rounded-lg border px-3 py-2"
                          placeholder={`Điểm / ${assignment?.max_score ?? 10}`}
                          value={gradeScore}
                          onChange={(e) => setGradeScore(e.target.value)}
                        />
                        <textarea
                          className="w-full rounded-lg border px-3 py-2"
                          rows={2}
                          placeholder="Nhận xét"
                          value={gradeComment}
                          onChange={(e) => setGradeComment(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={aiBusy || !selectedRubric}
                            onClick={() => void runAiGrade(s.id)}
                            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                            {aiBusy ? 'AI đang chấm...' : 'Chấm bằng AI'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveGrade(s.id)}
                            className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-sm"
                          >
                            Lưu điểm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setGradingId(null)
                              setPendingAiSuggestion(null)
                            }}
                            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-sky-700 hover:underline"
                        onClick={() => {
                          setGradingId(s.id)
                          setGradeScore(g ? String(g.score) : '')
                          setGradeComment(g?.comment ?? '')
                          setPendingAiSuggestion(null)
                        }}
                      >
                        Chấm điểm
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
