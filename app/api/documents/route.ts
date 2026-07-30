import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/db/server'
import { flattenDocumentTags } from '@/lib/db/document-tags'
import { logger } from '@/lib/logger'

const DOCUMENT_SELECT = `
  id, filename, file_type, status, error_message, file_size_bytes, chunk_count, description, folder_id, deleted_at, is_favorite, created_at,
  document_tags (
    tags (id, name, color)
  )
`

const DOCUMENT_SELECT_NO_FAVORITE = `
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

function isMissingColumn(
  error: { code?: string; message?: string } | null,
  column: string
): boolean {
  if (!error) return false
  return (
    error.code === '42703' ||
    (typeof error.message === 'string' && error.message.includes(column))
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
  const favoriteView = req.nextUrl.searchParams.get('favorite') === '1'

  type SelectMode = 'full' | 'no_favorite' | 'legacy'

  async function runQuery(mode: SelectMode) {
    const select =
      mode === 'full'
        ? DOCUMENT_SELECT
        : mode === 'no_favorite'
          ? DOCUMENT_SELECT_NO_FAVORITE
          : DOCUMENT_SELECT_LEGACY

    let query = supabase.from('documents').select(select).eq('user_id', user!.id)

    if (mode === 'legacy') {
      if (trashView) {
        return { data: [] as unknown[], error: null }
      }
      if (favoriteView) {
        // Column may be missing — empty until migration
        return { data: [] as unknown[], error: null }
      }
      query = query.order('created_at', { ascending: false })
      if (folderId !== undefined) {
        query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId)
      }
      return query
    }

    if (trashView) {
      query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    } else {
      query = query.is('deleted_at', null).order('created_at', { ascending: false })
      if (favoriteView) {
        if (mode === 'full') {
          query = query.eq('is_favorite', true)
        }
      } else if (folderId !== undefined) {
        query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId)
      }
    }

    return query
  }

  let { data, error } = await runQuery('full')

  if (isMissingColumn(error, 'is_favorite')) {
    logger.warn('documents.is_favorite missing — falling back until schema is updated', {
      userId: user.id,
      message: error?.message,
    })
    ;({ data, error } = await runQuery('no_favorite'))
  }

  if (isMissingColumn(error, 'deleted_at')) {
    logger.warn('documents.deleted_at missing — falling back until schema is updated', {
      userId: user.id,
      message: error?.message,
    })
    ;({ data, error } = await runQuery('legacy'))
  }

  if (error) {
    logger.error('Failed to fetch documents', {
      err: error,
      code: error.code,
      message: error.message,
      trashView,
      favoriteView,
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
      is_favorite?: boolean | null
    }
    return {
      ...rest,
      deleted_at: rest.deleted_at ?? null,
      is_favorite: Boolean(rest.is_favorite),
      tags: flattenDocumentTags(document_tags),
    }
  })

  return NextResponse.json(documents)
}
