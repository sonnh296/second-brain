import Link from 'next/link'
import Image from 'next/image'
import { createServerSupabaseClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'
import { HeaderActions } from '@/components/dashboard/header-actions'
import { BookOpen, GraduationCap } from 'lucide-react'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-50 via-background to-amber-50/40">
      <header className="shrink-0 border-b bg-background/80 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/home" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Note Everything"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-cover"
          />
          <span className="font-semibold text-lg">Note Everything</span>
        </Link>
        <HeaderActions />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl place-items-center">
          <Link
            href="/documents"
            className="group aspect-square w-full max-w-[220px] rounded-2xl border bg-background/90 p-6 shadow-sm transition hover:border-sky-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 flex flex-col items-center justify-center text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 mb-4 group-hover:scale-105 transition">
              <BookOpen className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Notes</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Kho tri thức cá nhân
            </p>
          </Link>

          <Link
            href="/classroom"
            className="group aspect-square w-full max-w-[220px] rounded-2xl border bg-background/90 p-6 shadow-sm transition hover:border-amber-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 flex flex-col items-center justify-center text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 mb-4 group-hover:scale-105 transition">
              <GraduationCap className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Classroom</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Lớp học & tài liệu chung
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
