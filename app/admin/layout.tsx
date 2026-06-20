import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!(await isAdmin(supabase, user.id))) {
    redirect('/documents')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Second Brain — Quản trị</span>
          <a href="/documents" className="text-sm text-muted-foreground hover:text-foreground">
            ← Về ứng dụng
          </a>
        </div>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Đăng xuất
          </button>
        </form>
      </header>
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  )
}
