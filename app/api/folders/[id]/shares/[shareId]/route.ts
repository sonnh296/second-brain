import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { assertFolderOwned } from '@/lib/folders/shares'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: folderId, shareId } = await params
  const folder = await assertFolderOwned(supabase, folderId, user.id)
  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  }

  const { data: share } = await supabase
    .from('folder_shares')
    .select('id')
    .eq('id', shareId)
    .eq('folder_id', folderId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!share) {
    return NextResponse.json({ error: 'Share not found' }, { status: 404 })
  }

  const { error } = await supabase.from('folder_shares').delete().eq('id', shareId)
  if (error) {
    return NextResponse.json({ error: 'Failed to revoke share' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
