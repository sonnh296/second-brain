import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/db/server'
import { isAdmin } from '@/lib/auth/admin'
import { AdminShell } from '@/components/admin/admin-shell'

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

  return <AdminShell>{children}</AdminShell>
}
