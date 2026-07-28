import { createServerSupabaseClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/documents')
  }

  redirect('/login')
}
