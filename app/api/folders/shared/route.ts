import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { listFoldersSharedWithMe } from '@/lib/folders/shares'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const folders = await listFoldersSharedWithMe(supabase, user.id)
    return NextResponse.json(folders)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list shared folders'
    if (message.includes('folder_shares') || message.includes('42P01')) {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
