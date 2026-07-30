import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
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

  const t = await getTranslations('nav')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold">{t('adminTitle')}</span>
          <a href="/documents" className="text-sm text-foreground/80 hover:text-foreground">
            {t('backToApp')}
          </a>
        </div>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="text-sm text-foreground/80 hover:text-foreground">
            {t('signOut')}
          </button>
        </form>
      </header>
      <main className="max-w-5xl mx-auto p-6">{children}</main>
    </div>
  )
}
