import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 z-20 border-b bg-background px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-lg">Second Brain</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/documents" className="text-muted-foreground hover:text-foreground transition-colors">
              Kho dữ liệu
            </Link>
            <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors">
              Chat
            </Link>
          </nav>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  )
}
