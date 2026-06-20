import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: doc } = await supabase
    .from('documents')
    .select('id, filename, file_type, status, note_content')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.file_type === 'note') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: doc.note_content ?? '',
      preview_type: 'text',
    })
  }

  if (doc.status !== 'done') {
    return NextResponse.json({
      filename: doc.filename,
      file_type: doc.file_type,
      status: doc.status,
      content: null,
      preview_type: 'unavailable',
      message: 'Document is still processing or failed',
    })
  }

  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('chunk_text, chunk_index')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true })

  const content = (chunks ?? []).map((c) => c.chunk_text).join('\n\n')

  return NextResponse.json({
    filename: doc.filename,
    file_type: doc.file_type,
    status: doc.status,
    content,
    preview_type: 'text',
  })
}
