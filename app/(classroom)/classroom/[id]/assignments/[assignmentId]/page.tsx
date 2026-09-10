'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { putToR2WithProgress } from '@/lib/upload/put-with-progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ClassroomLoading } from '@/components/classroom/classroom-loading'
import { ClassroomBreadcrumb } from '@/components/classroom/classroom-breadcrumb'
import {
  AssignmentCommentsPanel,
  AssignmentContentTabs,
  AssignmentEditor,
  AssignmentWorkEditor,
  markdownToHtml,
  type AssignmentComment,
} from '@/components/classroom/assignment-editor'

// type Rubric = { id: string; name: string; criteria: { items?: { id: string; label: string }[] } }

type FileMeta = { file_id?: string; filename: string; r2_key?: string }

type Grade = { score: number; comment: string | null }

type Submission = {
  id: string
  student_id: string
  username?: string | null
  files: FileMeta[]
  status: string
  content_md?: string | null
  grades?: Grade | Grade[] | null
}

type StudentRow = {
  student_id: string
  username: string | null
  submission: Submission | null
}

function gradeOf(grades?: Grade | Grade[] | null) {
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

function statusLabel(status: string | null | undefined) {
  if (!status) return 'Chưa nộp'
  if (status === 'draft') return 'Nháp'
  if (status === 'submitted') return 'Đã nộp'
  if (status === 'graded') return 'Đã chấm'
  return status
}

/** Student work is HTML (with studentText marks). Empty → seed from prompt markdown. */
function resolveWorkHtml(content: string | null | undefined, promptMd: string) {
  const existing = (content ?? '').trim()
  if (!existing) return markdownToHtml(promptMd ?? '')
  if (existing.startsWith('<')) return existing
  return markdownToHtml(existing)
}

const STUDENT_LIST_MIN = 160
const STUDENT_LIST_MAX = 420
const STUDENT_LIST_DEFAULT = 220

export default function AssignmentDetailPage() {
  const { id, assignmentId } = useParams<{ id: string; assignmentId: string }>()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [className, setClassName] = useState('')
  const [lesson, setLesson] = useState<{ id: string; title: string; lesson_index: number } | null>(
    null
  )
  const [assignment, setAssignment] = useState<{
    title: string
    description: string | null
    max_score: number
    lesson_id: string
  } | null>(null)

  const [promptMd, setPromptMd] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)
  const [studentContent, setStudentContent] = useState('')
  const [studentDirty, setStudentDirty] = useState(false)
  const [studentEditing, setStudentEditing] = useState(false)

  const [submission, setSubmission] = useState<Submission | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])

  const [activeTab, setActiveTab] = useState('prompt')
  const [openStudentTabs, setOpenStudentTabs] = useState<string[]>([])
  const [studentListW, setStudentListW] = useState(STUDENT_LIST_DEFAULT)

  const [comments, setComments] = useState<AssignmentComment[]>([])
  // Temporarily disabled: rubric + AI grading
  // const [rubrics, setRubrics] = useState<Rubric[]>([])
  // const [selectedRubric, setSelectedRubric] = useState('')
  const [gradeScore, setGradeScore] = useState('')
  const [gradeComment, setGradeComment] = useState('')
  const [gradeEditing, setGradeEditing] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // const [aiBusy, setAiBusy] = useState(false)
  // const [pendingAiSuggestion, setPendingAiSuggestion] = useState<unknown>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [commentBusy, setCommentBusy] = useState(false)

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}/comments`)
    if (!res.ok) return
    const data = await res.json()
    setComments(data.comments ?? [])
  }, [id, assignmentId])

  const load = useCallback(async () => {
    const [assignRes, classRes] = await Promise.all([
      fetch(`/api/classroom/${id}/assignments/${assignmentId}`),
      fetch(`/api/classroom/${id}`),
    ])
    if (assignRes.status === 403 || assignRes.status === 401) {
      setLoadError('Bạn không có quyền xem bài tập này')
      router.replace(`/classroom/${id}`)
      return
    }
    if (!assignRes.ok) {
      setLoadError('Không tải được bài tập')
      setLoading(false)
      return
    }
    setLoadError(null)
    const data = await assignRes.json()
    setRole(data.role)
    setAssignment(data.assignment)
    setLesson(data.lesson ?? null)
    setPromptMd(data.assignment?.description ?? '')
    setPromptDirty(false)

    if (classRes.ok) {
      const c = await classRes.json()
      setClassName(c.classroom?.name ?? '')
    }

    if (data.role === 'teacher') {
      setStudents(data.students ?? [])
      // Temporarily disabled: load rubrics for AI grading
      // const r = await fetch(`/api/classroom/${id}/rubrics`)
      // if (r.ok) {
      //   const rd = await r.json()
      //   setRubrics(rd.rubrics ?? [])
      // }
    } else {
      setSubmission(data.submission)
      const prompt = String(data.assignment?.description ?? '')
      setStudentContent(resolveWorkHtml(data.submission?.content_md, prompt))
      setStudentDirty(false)
      const st = data.submission?.status
      setStudentEditing(!st || st === 'draft')
    }

    await loadComments()
    setLoading(false)
  }, [id, assignmentId, router, loadComments])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - e.clientX
      const next = Math.min(
        STUDENT_LIST_MAX,
        Math.max(STUDENT_LIST_MIN, dragRef.current.startW + delta)
      )
      setStudentListW(next)
    }
    function onUp() {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const tabs = useMemo(() => {
    const base = [{ id: 'prompt', label: 'Đề bài', closable: false }]
    if (role !== 'teacher') return base
    return [
      ...base,
      ...openStudentTabs.map((sid) => {
        const row = students.find((s) => s.student_id === sid)
        return {
          id: `student:${sid}`,
          label: row?.username ?? sid.slice(0, 8),
          closable: true,
        }
      }),
    ]
  }, [role, openStudentTabs, students])

  const activeStudentId = activeTab.startsWith('student:')
    ? activeTab.slice('student:'.length)
    : null

  const activeStudent = activeStudentId
    ? students.find((s) => s.student_id === activeStudentId) ?? null
    : null

  const visibleComments = comments.filter((c) => {
    if (activeStudentId) {
      return c.submission_id === activeStudent?.submission?.id
    }
    return c.submission_id == null
  })

  function openStudentTab(studentId: string) {
    setOpenStudentTabs((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]))
    setActiveTab(`student:${studentId}`)
    const row = students.find((s) => s.student_id === studentId)
    if (row?.submission) {
      const g = gradeOf(row.submission.grades)
      setGradeScore(g ? String(g.score) : '')
      setGradeComment(g?.comment ?? '')
      setGradeEditing(row.submission.status !== 'graded')
    } else {
      setGradeScore('')
      setGradeComment('')
      setGradeEditing(false)
    }
  }

  function closeStudentTab(tabId: string) {
    const sid = tabId.startsWith('student:') ? tabId.slice('student:'.length) : tabId
    setOpenStudentTabs((prev) => prev.filter((x) => x !== sid))
    if (activeTab === `student:${sid}`) {
      setActiveTab('prompt')
    }
  }

  async function savePrompt() {
    if (!promptDirty || saveBusy) return
    setSaveBusy(true)
    setMsg(null)
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', description: promptMd }),
    })
    setSaveBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Không lưu được đề bài')
      return
    }
    setPromptDirty(false)
    setAssignment((a) => (a ? { ...a, description: promptMd } : a))
    setMsg('Đã lưu đề bài')
  }

  async function saveStudentContent(submit: boolean) {
    if (saveBusy) return
    setSaveBusy(true)
    setMsg(null)
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: submit ? 'submit_content' : 'save_content',
        content_md: studentContent,
      }),
    })
    setSaveBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Không lưu được bài')
      return
    }
    setStudentDirty(false)
    setMsg(submit ? 'Đã nộp bài' : 'Đã lưu nháp')
    if (submit) setStudentEditing(false)
    await load()
  }

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
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'grade',
        submission_id: submissionId,
        score: Number(gradeScore),
        comment: gradeComment,
        method: 'manual',
        // Temporarily disabled: rubric + AI
        // method: pendingAiSuggestion ? 'ai' : 'manual',
        // rubric_id: selectedRubric || null,
        // ai_suggestion: pendingAiSuggestion ?? null,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Chấm thất bại')
      return
    }
    // setPendingAiSuggestion(null)
    setGradeEditing(false)
    await load()
  }

  // Temporarily disabled: AI grading
  // async function runAiGrade(submissionId: string) {
  //   if (!selectedRubric) {
  //     setMsg('Chọn tiêu chí chấm trước')
  //     return
  //   }
  //   setAiBusy(true)
  //   setMsg(null)
  //   const res = await fetch(`/api/classroom/${id}/grade-ai`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ submission_id: submissionId, rubric_id: selectedRubric }),
  //   })
  //   setAiBusy(false)
  //   if (!res.ok) {
  //     const d = await res.json().catch(() => ({}))
  //     setMsg(d.error ?? 'AI chấm thất bại')
  //     return
  //   }
  //   const data = await res.json()
  //   const s = data.suggestion as { score?: number; comment?: string }
  //   if (s?.score != null) setGradeScore(String(s.score))
  //   if (s?.comment) setGradeComment(s.comment)
  //   setPendingAiSuggestion(data.suggestion)
  //   setMsg('AI đã đề xuất điểm — kiểm tra rồi bấm Lưu điểm')
  // }

  async function addComment(quote: string, body: string) {
    setCommentBusy(true)
    const res = await fetch(`/api/classroom/${id}/assignments/${assignmentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_text: quote,
        body,
        submission_id: activeStudent?.submission?.id ?? null,
      }),
    })
    setCommentBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Không thêm được nhận xét')
      return
    }
    await loadComments()
  }

  async function resolveComment(commentId: string) {
    await fetch(`/api/classroom/${id}/assignments/${assignmentId}/comments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId, resolve: true }),
    })
    await loadComments()
  }

  async function deleteComment(commentId: string) {
    await fetch(`/api/classroom/${id}/assignments/${assignmentId}/comments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: commentId, delete: true }),
    })
    await loadComments()
  }

  const myGrade = gradeOf(submission?.grades)
  const activeGraded = activeStudent?.submission?.status === 'graded'
  const gradeInputsLocked = Boolean(activeGraded && !gradeEditing)

  const gradingSlot =
    role === 'teacher' && activeStudent?.submission ? (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Chấm điểm</p>
          {activeGraded && gradeScore.trim() !== '' && (
            <span className="text-base font-bold text-amber-600 tabular-nums">
              {gradeScore}
            </span>
          )}
        </div>
        {/* Temporarily disabled: tiêu chí chấm + chấm bằng AI
        <select ... />
        */}
        <Input
          type="number"
          step="any"
          placeholder="Điểm (tự do)"
          value={gradeScore}
          disabled={gradeInputsLocked}
          onChange={(e) => setGradeScore(e.target.value)}
          className={cn(
            'font-bold tabular-nums',
            gradeScore.trim() && 'text-amber-600 text-base'
          )}
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
          rows={2}
          placeholder="Nhận xét điểm"
          value={gradeComment}
          disabled={gradeInputsLocked}
          onChange={(e) => setGradeComment(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {/* Temporarily disabled: chấm bằng AI ... */}
          {gradeInputsLocked ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setGradeEditing(true)}>
              Sửa
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!gradeScore.trim()}
              onClick={() => void saveGrade(activeStudent.submission!.id)}
            >
              Lưu điểm
            </Button>
          )}
          {activeGraded && gradeEditing && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const g = gradeOf(activeStudent.submission?.grades)
                setGradeScore(g ? String(g.score) : '')
                setGradeComment(g?.comment ?? '')
                setGradeEditing(false)
              }}
            >
              Hủy
            </Button>
          )}
        </div>
      </div>
    ) : role === 'teacher' && activeStudent && !activeStudent.submission ? (
      <p className="text-xs text-muted-foreground">Học sinh chưa nộp — chưa chấm được.</p>
    ) : null

  if (loading) {
    return <ClassroomLoading label="Đang tải bài tập..." />
  }

  if (loadError) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  const lessonHref = lesson
    ? `/classroom/${id}/lessons/${lesson.id}/assignment`
    : `/classroom/${id}`

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 space-y-2 border-b">
        <ClassroomBreadcrumb
          items={[
            { label: 'Lớp học', href: '/classroom' },
            { label: className || 'Lớp', href: `/classroom/${id}` },
            { label: lesson?.title ?? 'Buổi học', href: lesson ? `/classroom/${id}/lessons/${lesson.id}` : `/classroom/${id}` },
            { label: 'Bài tập', href: lessonHref },
            { label: assignment?.title ?? 'Chi tiết' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{assignment?.title ?? '...'}</h1>
          {role === 'teacher' && promptDirty && (
            <Button
              type="button"
              size="sm"
              className="h-7"
              disabled={saveBusy}
              onClick={() => void savePrompt()}
            >
              {saveBusy ? 'Đang lưu...' : 'Lưu đề bài'}
            </Button>
          )}
          {role === 'student' && (
            <div className="ml-auto flex gap-2">
              {!studentEditing &&
              (submission?.status === 'submitted' || submission?.status === 'graded') ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setStudentEditing(true)}
                >
                  Chỉnh sửa
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={saveBusy || !studentDirty}
                    onClick={() => void saveStudentContent(false)}
                  >
                    Lưu nháp
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={saveBusy}
                    onClick={() => void saveStudentContent(true)}
                  >
                    Nộp bài
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {msg && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {msg}
          </p>
        )}
      </div>

      {role === 'teacher' ? (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="min-h-0 flex-1 min-w-0 flex flex-col border-r">
            <AssignmentContentTabs
              tabs={tabs}
              activeId={activeTab}
              onSelect={(tabId) => {
                setActiveTab(tabId)
                if (tabId.startsWith('student:')) {
                  openStudentTab(tabId.slice('student:'.length))
                }
              }}
              onCloseTab={closeStudentTab}
            />
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-3">
                {activeTab === 'prompt' ? (
                  <AssignmentEditor
                    value={promptMd}
                    onChange={(md) => {
                      setPromptMd(md)
                      setPromptDirty(true)
                    }}
                    placeholder="Soạn đề bài như Word..."
                    minHeightClass="min-h-[320px]"
                  />
                ) : activeStudent ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {activeStudent.username ?? activeStudent.student_id.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground">
                        · {statusLabel(activeStudent.submission?.status)}
                      </span>
                      {gradeOf(activeStudent.submission?.grades) && (
                        <span className="font-bold text-amber-600 tabular-nums">
                          · {gradeOf(activeStudent.submission?.grades)!.score}
                        </span>
                      )}
                    </div>

                    {!activeStudent.submission ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Học sinh chưa nộp bài.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Đề gốc màu thường — phần học sinh viết hiện chữ đỏ.
                        </p>
                        <AssignmentWorkEditor
                          valueHtml={resolveWorkHtml(
                            activeStudent.submission.content_md,
                            promptMd
                          )}
                          onChange={() => {}}
                          disabled
                          studentTyping={false}
                          minHeightClass="min-h-[320px]"
                        />
                        {(activeStudent.submission.files ?? []).length > 0 && (
                          <ul className="text-sm space-y-1">
                            {activeStudent.submission.files.map((f) => (
                              <li key={f.file_id ?? f.filename}>
                                {f.file_id ? (
                                  <a
                                    href={downloadHref(
                                      id,
                                      assignmentId,
                                      f.file_id,
                                      activeStudent.student_id
                                    )}
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
                        )}
                      </>
                    )}
                  </>
                ) : null}
              </div>
              <div className="w-full md:w-72 shrink-0 min-h-[280px] md:min-h-0 border-t md:border-t-0">
                <AssignmentCommentsPanel
                  comments={visibleComments}
                  canComment={
                    activeTab === 'prompt' || Boolean(activeStudent?.submission)
                  }
                  busy={commentBusy}
                  onAdd={addComment}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                  gradingSlot={gradingSlot}
                />
              </div>
            </div>
          </div>

          {/* Drag handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi độ rộng danh sách học sinh"
            className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-border/60 hover:bg-primary/40 active:bg-primary/50"
            onPointerDown={(e) => {
              dragRef.current = { startX: e.clientX, startW: studentListW }
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
            }}
          />

          <div
            className="hidden lg:block min-h-0 overflow-y-auto p-2 space-y-2 shrink-0 border-l"
            style={{ width: studentListW }}
          >
            <h2 className="text-sm font-medium px-1">Học sinh</h2>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">Chưa có học sinh trong lớp.</p>
            ) : (
              <ul className="space-y-1">
                {students.map((s) => {
                  const status = s.submission?.status
                  const g = gradeOf(s.submission?.grades)
                  const selected = activeStudentId === s.student_id
                  return (
                    <li key={s.student_id}>
                      <button
                        type="button"
                        onClick={() => openStudentTab(s.student_id)}
                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition ${
                          selected ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium truncate">
                            {s.username ?? s.student_id.slice(0, 8)}
                          </span>
                          <span
                            className={`ml-auto text-[10px] shrink-0 ${
                              !status
                                ? 'text-amber-700'
                                : status === 'graded'
                                  ? 'text-emerald-700'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {statusLabel(status)}
                            {g ? (
                              <span className="font-bold text-amber-600"> · {g.score}</span>
                            ) : (
                              ''
                            )}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Mobile student list below on small screens */}
          <div className="lg:hidden w-full border-t p-2 space-y-2 max-h-48 overflow-y-auto">
            <h2 className="text-sm font-medium px-1">Học sinh</h2>
            <ul className="space-y-1">
              {students.map((s) => {
                const status = s.submission?.status
                const g = gradeOf(s.submission?.grades)
                const selected = activeStudentId === s.student_id
                return (
                  <li key={s.student_id}>
                    <button
                      type="button"
                      onClick={() => openStudentTab(s.student_id)}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 transition ${
                        selected ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {s.username ?? s.student_id.slice(0, 8)}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {statusLabel(status)}
                          {g ? (
                            <span className="font-bold text-amber-600"> · {g.score}</span>
                          ) : null}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-4">
            <div className="text-sm text-muted-foreground">
              Trạng thái: {statusLabel(submission?.status)}
              {myGrade && (
                <span>
                  {' '}
                  · Điểm{' '}
                  <strong className="text-amber-600 text-base font-bold tabular-nums">
                    {myGrade.score}
                  </strong>
                  {myGrade.comment ? ` — ${myGrade.comment}` : ''}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Làm trực tiếp trên đề bài. Phần bạn gõ/dán mới sẽ hiện màu đỏ; đề gốc giữ màu thường.
            </p>
            <AssignmentWorkEditor
              valueHtml={studentContent}
              onChange={(html) => {
                setStudentContent(html)
                setStudentDirty(true)
              }}
              disabled={!studentEditing}
              studentTyping={studentEditing}
              placeholder="Gõ câu trả lời vào đề..."
              minHeightClass="min-h-[360px]"
            />

            {(submission?.files ?? []).length > 0 && (
              <ul className="text-sm space-y-1">
                {submission!.files.map((f) => (
                  <li key={f.file_id ?? f.filename}>
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
            )}
            {studentEditing && (
              <div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={progress !== null}
                  onClick={() => fileRef.current?.click()}
                >
                  {progress !== null ? `Đang tải ${progress}%` : 'Đính kèm file (≤100MB)'}
                </Button>
              </div>
            )}
          </div>
          <div className="w-full md:w-72 shrink-0 min-h-[200px] md:min-h-0 border-t md:border-t-0">
            <AssignmentCommentsPanel
              comments={comments.filter(
                (c) =>
                  c.submission_id == null ||
                  (submission && c.submission_id === submission.id)
              )}
              canComment={false}
              onAdd={async () => {}}
            />
          </div>
        </div>
      )}
    </div>
  )
}
