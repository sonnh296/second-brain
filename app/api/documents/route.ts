import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { flattenDocumentTags } from '@/lib/db/document-tags'

const DOCUMENT_SELECT = `
  id, filename, file_type, status, error_message, file_size_bytes, chunk_count, description, folder_id, extracted_content, ocr_text, created_at,
  document_tags (
    tags (id, name, color)
  )
`

function parseFolderId(raw: string | null): string | null | undefined {
  if (raw === null) return undefined
  if (raw === 'root' || raw === 'null' || raw === '') return null
  return raw
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = parseFolderId(req.nextUrl.searchParams.get('folder_id'))

  let query = supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (folderId !== undefined) {
    query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }

  const documents = (data ?? []).map((doc) => {
    const { document_tags, ...rest } = doc as typeof doc & {
      document_tags?: Parameters<typeof flattenDocumentTags>[0]
    }
    return {
      ...rest,
      tags: flattenDocumentTags(document_tags),
    }
  })

  return NextResponse.json(documents)
}
