import Link from 'next/link'
import Image from 'next/image'
import { createServerSupabaseClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'
import { HeaderActions } from '@/components/dashboard/header-actions'

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
      <header className="shrink-0 z-20 border-b bg-background px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link href="/documents" className="flex items-center gap-2 shrink-0">
            <Image
              src="/logo.png"
              alt="Note Everything"
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-cover"
            />
            <span className="font-semibold text-base sm:text-lg hidden sm:inline">
              Note Everything
            </span>
          </Link>
          <nav className="flex gap-3 sm:gap-4 text-sm">
            <Link href="/documents" className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Kho dữ liệu
            </Link>
            <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors">
              Chat
            </Link>
          </nav>
        </div>
        <HeaderActions />
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  )
}
