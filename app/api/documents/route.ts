import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { flattenDocumentTags } from '@/lib/db/document-tags'
import { logger } from '@/lib/logger'

const DOCUMENT_SELECT = `
  id, filename, file_type, status, error_message, file_size_bytes, chunk_count, description, folder_id, deleted_at, created_at,
  document_tags (
    tags (id, name, color)
  )
`

const DOCUMENT_SELECT_LEGACY = `
  id, filename, file_type, status, error_message, file_size_bytes, chunk_count, description, folder_id, created_at,
  document_tags (
    tags (id, name, color)
  )
`

function parseFolderId(raw: string | null): string | null | undefined {
  if (raw === null) return undefined
  if (raw === 'root' || raw === 'null' || raw === '') return null
  return raw
}

function isMissingDeletedAtColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42703' ||
    (typeof error.message === 'string' && error.message.includes('deleted_at'))
  )
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
  const trashView = req.nextUrl.searchParams.get('trash') === '1'

  async function runQuery(withSoftDelete: boolean) {
    let query = supabase
      .from('documents')
      .select(withSoftDelete ? DOCUMENT_SELECT : DOCUMENT_SELECT_LEGACY)
      .eq('user_id', user!.id)

    if (withSoftDelete) {
      if (trashView) {
        query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      } else {
        query = query.is('deleted_at', null).order('created_at', { ascending: false })
        if (folderId !== undefined) {
          query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId)
        }
      }
    } else {
      if (trashView) {
        // Soft-delete column chưa có → thùng rác trống
        return { data: [] as unknown[], error: null }
      }
      query = query.order('created_at', { ascending: false })
      if (folderId !== undefined) {
        query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId)
      }
    }

    return query
  }

  let { data, error } = await runQuery(true)

  if (isMissingDeletedAtColumn(error)) {
    logger.warn('documents.deleted_at missing — falling back until schema is updated', {
      userId: user.id,
      message: error?.message,
    })
    ;({ data, error } = await runQuery(false))
  }

  if (error) {
    logger.error('Failed to fetch documents', {
      err: error,
      code: error.code,
      message: error.message,
      trashView,
      folderId,
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Failed to fetch documents', detail: error.message },
      { status: 500 }
    )
  }

  const documents = (data ?? []).map((doc) => {
    const { document_tags, ...rest } = doc as typeof doc & {
      document_tags?: Parameters<typeof flattenDocumentTags>[0]
      deleted_at?: string | null
    }
    return {
      ...rest,
      deleted_at: rest.deleted_at ?? null,
      tags: flattenDocumentTags(document_tags),
    }
  })

  return NextResponse.json(documents)
}
