'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpen,
  ClipboardList,
  Copy,
  Folder,
  FolderOpen,
  Home,
  Menu,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

function navClass(active: boolean) {
  return `w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
    active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-foreground hover:bg-muted'
  }`
}

export function ClassroomWorkspace({
  classId,
  children,
}: {
  classId: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [role, setRole] = useState<'teacher' | 'student'>('student')
  const [searchQ, setSearchQ] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classroom/${classId}`)
    if (res.status === 401 || res.status === 403) {
      setLoadError('Bạn không thuộc lớp này')
      router.replace('/classroom')
      return
    }
    if (!res.ok) {
      setLoadError('Không tải được thông tin lớp')
      return
    }
    setLoadError(null)
    const data = await res.json()
    setName(data.classroom.name)
    setJoinCode(data.classroom.join_code)
    setRole(data.role)
  }, [classId, router])

  useEffect(() => {
    void load()
  }, [load])

  async function rotateCode() {
    const res = await fetch(`/api/classroom/${classId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotate_code: true }),
    })
    if (res.ok) {
      const d = await res.json()
      setJoinCode(d.join_code)
    }
  }

  function goChat(e?: React.FormEvent) {
    e?.preventDefault()
    const q = searchQ.trim()
    router.push(
      q
        ? `/classroom/${classId}/chat?q=${encodeURIComponent(q)}`
        : `/classroom/${classId}/chat`
    )
    setSidebarOpen(false)
  }

  const base = `/classroom/${classId}`
  const onLessons = pathname === base || pathname === `${base}/`
  const onShared = pathname.startsWith(`${base}/shared`)
  const onAssignments = pathname.startsWith(`${base}/assignments`)
  const onReview = pathname.startsWith(`${base}/review`)
  const onChat = pathname.startsWith(`${base}/chat`)

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-2 h-full">
      <Link
        href="/classroom"
        className={navClass(false)}
        onClick={() => setSidebarOpen(false)}
      >
        <Home className="h-4 w-4 shrink-0" />
        Home
      </Link>
      <div className="my-1 border-t" />
      <Link
        href={base}
        className={navClass(onLessons || pathname.includes('/lessons/'))}
        onClick={() => setSidebarOpen(false)}
      >
        <Folder className="h-4 w-4 shrink-0" />
        Buổi học
      </Link>
      <Link
        href={`${base}/shared`}
        className={navClass(onShared)}
        onClick={() => setSidebarOpen(false)}
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        Tài liệu chung
      </Link>
      <Link
        href={`${base}/assignments`}
        className={navClass(onAssignments && !pathname.includes('/lessons/'))}
        onClick={() => setSidebarOpen(false)}
      >
        <ClipboardList className="h-4 w-4 shrink-0" />
        Bài tập
      </Link>
      <Link
        href={`${base}/review`}
        className={navClass(onReview)}
        onClick={() => setSidebarOpen(false)}
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        Ôn tập
      </Link>
    </nav>
  )

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 border-b px-3 sm:px-5 py-3 sticky top-0 z-30 bg-background">
        <div className="flex flex-nowrap items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            className="md:hidden p-2 rounded-md hover:bg-muted shrink-0"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Menu"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <h1 className="text-base sm:text-xl font-semibold truncate min-w-0 max-w-[28%] sm:max-w-none sm:shrink">
            {name || '…'}
          </h1>

          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href={`${base}/review`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm border transition-colors ${
                onReview
                  ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                  : 'hover:bg-muted'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Ôn tập</span>
            </Link>
            <Link
              href={`${base}/assignments`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm border transition-colors ${
                onAssignments
                  ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                  : 'hover:bg-muted'
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Bài tập</span>
            </Link>
          </div>

          {role === 'teacher' && joinCode && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
              <code className="font-mono tracking-wider bg-muted px-2 py-1 rounded text-xs sm:text-sm">
                {joinCode}
              </code>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-muted"
                onClick={() => void navigator.clipboard.writeText(joinCode)}
                title="Copy mã"
                aria-label="Copy mã lớp"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-muted"
                onClick={() => void rotateCode()}
                title="Đổi mã"
                aria-label="Đổi mã lớp"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          )}

          <form onSubmit={goChat} className="relative flex-1 min-w-0 basis-24 sm:basis-56 max-w-xl ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search AI — hỏi tài liệu trong lớp..."
              className={`w-full h-10 rounded-lg border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                onChat ? 'ring-2 ring-ring' : ''
              }`}
            />
          </form>
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
        <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
