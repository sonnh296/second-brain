import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PendingChatAction } from '@/lib/db/types'
import { enqueueIngestionJob } from '@/lib/queue'
import { checkDocumentQuota } from '@/lib/upload-limits'
import { cleanupFailedUpload } from '@/lib/upload/cleanup-document'
import { logger } from '@/lib/logger'

const PREVIEW_LENGTH = 200
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Prefer plain string in tool JSON Schema — Zod `.uuid()` adds format:uuid and
 *  causes Anthropic/AI-SDK stream failures when the model emits a slightly-off id. */
const IdSchema = z.string().min(1).max(80).describe('UUID lấy từ tool search/list')

function preview(text: string): string {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

/** Escape characters that break Supabase .or() ilike filters. */
function sanitizeSearchTerm(q: string): string {
  return q.replace(/[%,()]/g, ' ').trim()
}

function parseId(raw: string, label: string): string | { error: string } {
  const id = raw.trim()
  if (!UUID_RE.test(id)) {
    return { error: `${label} không hợp lệ. Gọi lại search/list để lấy đúng ID.` }
  }
  return id
}

export interface NoteToolsContext {
  supabase: SupabaseClient
  userId: string
  sessionId: string
  /** Called when a tool creates a pending action needing user confirmation. */
  onPendingAction: (action: PendingChatAction) => void
}

/**
 * Chat tools for note management.
 *
 * Safety model:
 * - search/create/restore execute immediately (read-only or non-destructive)
 * - update/delete only create a *pending* chat_actions row; the user must
 *   confirm via the UI before /api/chat/actions/[id] executes it
 * - every tool verifies ownership; destructive ops re-verify at confirm time
 */
export function buildNoteTools(ctx: NoteToolsContext) {
  const { supabase, userId, sessionId, onPendingAction } = ctx

  async function findOwnedNote(documentId: string) {
    const { data: doc } = await supabase
      .from('documents')
      .select('id, filename, file_type, note_content, deleted_at')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()
    return doc
  }

  return {
    search_notes: tool({
      description:
        'Tìm ghi chú (note) của người dùng theo từ khóa trong tiêu đề hoặc nội dung. Luôn dùng tool này trước khi sửa/xóa để lấy đúng document_id.',
      parameters: z.object({
        query: z.string().min(1).max(200).describe('Từ khóa tìm kiếm'),
      }),
      execute: async ({ query }) => {
        const term = sanitizeSearchTerm(query)
        let builder = supabase
          .from('documents')
          .select('id, filename, note_content, status, created_at')
          .eq('user_id', userId)
          .eq('file_type', 'note')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        if (term) {
          builder = builder.or(`filename.ilike.%${term}%,note_content.ilike.%${term}%`)
        }

        const { data: notes, error } = await builder
        if (error) {
          logger.error('search_notes failed', { err: error, userId })
          return { error: 'Không tìm kiếm được, thử lại sau.' }
        }
        return {
          notes: (notes ?? []).map((n) => ({
            document_id: n.id,
            title: n.filename,
            snippet: preview(n.note_content ?? ''),
            created_at: n.created_at,
          })),
        }
      },
    }),

    create_note: tool({
      description:
        'Tạo ghi chú mới cho người dùng. Chạy ngay không cần xác nhận (không phá hủy dữ liệu).',
      parameters: z.object({
        title: z.string().min(1).max(200).describe('Tiêu đề ghi chú'),
        content: z.string().min(1).max(50000).describe('Nội dung ghi chú'),
      }),
      execute: async ({ title, content }) => {
        const contentBytes = Buffer.byteLength(content, 'utf8')

        try {
          const quota = await checkDocumentQuota(supabase, userId, contentBytes)
          if (!quota.ok) {
            return { error: quota.error.message }
          }

          const { data: doc, error: docErr } = await supabase
            .from('documents')
            .insert({
              user_id: userId,
              filename: title,
              file_type: 'note',
              r2_key: 'note',
              note_content: content,
              file_size_bytes: contentBytes,
              status: 'pending',
            })
            .select('id')
            .single()

          if (docErr || !doc) {
            return { error: 'Không tạo được ghi chú.' }
          }

          const r2Key = `notes/${userId}/${doc.id}`
          await supabase.from('documents').update({ r2_key: r2Key }).eq('id', doc.id)

          try {
            await enqueueIngestionJob({
              document_id: doc.id,
              r2_key: r2Key,
              file_type: 'note',
              user_id: userId,
            })
          } catch (err) {
            logger.error('create_note: queue failed', { err, userId, documentId: doc.id })
            await cleanupFailedUpload(supabase, doc.id, userId, r2Key)
            return { error: 'Không xử lý được ghi chú, đã hủy tạo.' }
          }

          await supabase.from('chat_actions').insert({
            user_id: userId,
            session_id: sessionId,
            action_type: 'create_note',
            document_id: doc.id,
            payload: { title, preview: preview(content) },
            status: 'executed',
            executed_at: new Date().toISOString(),
          })

          return { success: true, document_id: doc.id, title }
        } catch (err) {
          logger.error('create_note failed', { err, userId })
          return { error: 'Không tạo được ghi chú.' }
        }
      },
    }),

    propose_update_note: tool({
      description:
        'Đề xuất cập nhật nội dung/tiêu đề một ghi chú. KHÔNG thực thi ngay — người dùng phải bấm Xác nhận trong giao diện. Cần document_id chính xác từ search_notes.',
      parameters: z.object({
        document_id: IdSchema.describe('ID ghi chú (lấy từ search_notes)'),
        new_content: z
          .string()
          .min(1)
          .max(20000)
          .describe('Nội dung mới đầy đủ (thay thế toàn bộ). Giữ ngắn gọn nếu có thể.'),
        new_title: z.string().min(1).max(200).optional().describe('Tiêu đề mới (nếu đổi tên)'),
      }),
      execute: async ({ document_id, new_content, new_title }) => {
        try {
          const id = parseId(document_id, 'document_id')
          if (typeof id !== 'string') return id

          const doc = await findOwnedNote(id)
          if (!doc || doc.deleted_at) {
            return { error: 'Không tìm thấy ghi chú này.' }
          }
          if (doc.file_type !== 'note') {
            return { error: 'Chỉ có thể sửa ghi chú (note), không sửa được file upload.' }
          }

          const { data: action, error } = await supabase
            .from('chat_actions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              action_type: 'update_note',
              document_id: id,
              payload: {
                new_content,
                new_title: new_title ?? null,
                old_title: doc.filename,
                preview: preview(new_content),
              },
              status: 'pending',
            })
            .select('id')
            .single()

          if (error || !action) {
            logger.error('propose_update_note failed', { err: error, userId, documentId: id })
            return { error: 'Không tạo được đề xuất.' }
          }

          onPendingAction({
            id: action.id,
            action_type: 'update_note',
            document_id: id,
            filename: new_title ?? doc.filename,
            preview: preview(new_content),
          })

          return {
            proposal_created: true,
            action_id: action.id,
            note_title: doc.filename,
            message: 'Đề xuất đã tạo. Báo người dùng bấm nút Xác nhận trong giao diện để áp dụng.',
          }
        } catch (err) {
          logger.error('propose_update_note threw', { err, userId })
          return { error: 'Lỗi khi tạo đề xuất sửa note. Thử lại.' }
        }
      },
    }),

    propose_delete_note: tool({
      description:
        'Đề xuất xóa một ghi chú (chuyển vào thùng rác, khôi phục được). KHÔNG thực thi ngay — người dùng phải bấm Xác nhận. Cần document_id chính xác từ search_notes.',
      parameters: z.object({
        document_id: IdSchema.describe('ID ghi chú (lấy từ search_notes)'),
      }),
      execute: async ({ document_id }) => {
        try {
          const id = parseId(document_id, 'document_id')
          if (typeof id !== 'string') return id

          const doc = await findOwnedNote(id)
          if (!doc || doc.deleted_at) {
            return { error: 'Không tìm thấy ghi chú này.' }
          }
          if (doc.file_type !== 'note') {
            return { error: 'Chỉ có thể xóa ghi chú (note) qua chat, không xóa được file upload.' }
          }

          const { data: action, error } = await supabase
            .from('chat_actions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              action_type: 'delete_note',
              document_id: id,
              payload: { title: doc.filename, preview: preview(doc.note_content ?? '') },
              status: 'pending',
            })
            .select('id')
            .single()

          if (error || !action) {
            logger.error('propose_delete_note failed', { err: error, userId, documentId: id })
            return { error: 'Không tạo được đề xuất.' }
          }

          onPendingAction({
            id: action.id,
            action_type: 'delete_note',
            document_id: id,
            filename: doc.filename,
            preview: preview(doc.note_content ?? ''),
          })

          return {
            proposal_created: true,
            action_id: action.id,
            note_title: doc.filename,
            message: 'Đề xuất xóa đã tạo. Báo người dùng bấm nút Xác nhận trong giao diện.',
          }
        } catch (err) {
          logger.error('propose_delete_note threw', { err, userId })
          return { error: 'Lỗi khi tạo đề xuất xóa note. Thử lại.' }
        }
      },
    }),

    search_documents: tool({
      description:
        'Tìm tài liệu (mọi loại file: pdf, ảnh, docx, note...) theo tên/mô tả. Dùng trước khi đổi tên/di chuyển/gắn tag. Nếu không biết tên chính xác, truyền query rỗng hoặc "*" để lấy danh sách file gần đây. KHÔNG tìm bằng tên MỚI mà user muốn đặt.',
      parameters: z.object({
        query: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Từ khóa trong tên/mô tả hiện tại của file. Dùng "*" hoặc bỏ trống nếu cần liệt kê file gần đây.'
          ),
      }),
      execute: async ({ query }) => {
        try {
          const term = sanitizeSearchTerm(!query || query === '*' ? '' : query)

          async function fetchRecent(limit = 15) {
            return supabase
              .from('documents')
              .select('id, filename, file_type, folder_id, description, created_at')
              .eq('user_id', userId)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(limit)
          }

          let docs: {
            id: string
            filename: string
            file_type: string
            folder_id: string | null
            description: string | null
            created_at: string
          }[] = []
          let matchedByQuery = false

          if (term) {
            const { data, error } = await supabase
              .from('documents')
              .select('id, filename, file_type, folder_id, description, created_at')
              .eq('user_id', userId)
              .is('deleted_at', null)
              .or(`filename.ilike.%${term}%,description.ilike.%${term}%`)
              .order('created_at', { ascending: false })
              .limit(15)
            if (error) {
              logger.error('search_documents failed', { err: error, userId })
              return { error: 'Không tìm kiếm được, thử lại sau.' }
            }
            docs = data ?? []
            matchedByQuery = docs.length > 0
          }

          if (docs.length === 0) {
            const { data, error } = await fetchRecent()
            if (error) {
              logger.error('search_documents recent failed', { err: error, userId })
              return { error: 'Không tìm kiếm được, thử lại sau.' }
            }
            docs = data ?? []
          }

          let folders: {
            id: string
            name: string
            parent_id: string | null
            description: string | null
          }[] = []
          if (term) {
            const { data: folderRows } = await supabase
              .from('folders')
              .select('id, name, parent_id, description')
              .eq('user_id', userId)
              .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
              .order('name')
              .limit(10)
            folders = folderRows ?? []
          }

          return {
            matched_by_query: matchedByQuery,
            hint: matchedByQuery
              ? undefined
              : term
                ? `Không khớp tên file "${term}". Đây là các file gần đây — hỏi user chọn đúng file.`
                : 'Danh sách file gần đây.',
            documents: docs.map((d) => ({
              document_id: d.id,
              filename: d.filename,
              file_type: d.file_type,
              folder_id: d.folder_id,
              description: d.description,
            })),
            folders: folders.map((f) => ({
              folder_id: f.id,
              name: f.name,
              parent_id: f.parent_id,
              description: f.description,
            })),
          }
        } catch (err) {
          logger.error('search_documents threw', { err, userId })
          return { error: 'Không tìm kiếm được, thử lại sau.' }
        }
      },
    }),

    list_folders: tool({
      description:
        'Liệt kê hoặc tìm thư mục theo tên/mô tả (lấy folder_id khi di chuyển file, hoặc khi user hỏi về folder).',
      parameters: z.object({
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Từ khóa tên/mô tả thư mục. Bỏ trống để liệt kê tất cả.'),
      }),
      execute: async ({ query }) => {
        try {
          const term = sanitizeSearchTerm(!query || query === '*' ? '' : query)
          let builder = supabase
            .from('folders')
            .select('id, name, parent_id, description')
            .eq('user_id', userId)
            .order('name')
            .limit(100)
          if (term) {
            builder = builder.or(`name.ilike.%${term}%,description.ilike.%${term}%`)
          }
          const { data: folders } = await builder
          return {
            folders: (folders ?? []).map((f) => ({
              folder_id: f.id,
              name: f.name,
              parent_id: f.parent_id,
              description: f.description,
            })),
          }
        } catch (err) {
          logger.error('list_folders threw', { err, userId })
          return { error: 'Không liệt kê được thư mục.' }
        }
      },
    }),

    list_tags: tool({
      description: 'Liệt kê tag của người dùng (để lấy tag_id khi gắn tag cho tài liệu).',
      parameters: z.object({
        _: z.string().optional().describe('Bỏ trống'),
      }),
      execute: async () => {
        try {
          const { data: tags } = await supabase
            .from('tags')
            .select('id, name, color')
            .eq('user_id', userId)
            .order('name')
            .limit(100)
          return {
            tags: (tags ?? []).map((t) => ({ tag_id: t.id, name: t.name })),
          }
        } catch (err) {
          logger.error('list_tags threw', { err, userId })
          return { error: 'Không liệt kê được tag.' }
        }
      },
    }),

    propose_rename_document: tool({
      description:
        'Đề xuất đổi tên một tài liệu (mọi loại file). KHÔNG thực thi ngay — người dùng phải bấm Xác nhận.',
      parameters: z.object({
        document_id: IdSchema.describe('ID tài liệu (lấy từ search_documents)'),
        new_name: z.string().min(1).max(200).describe('Tên mới'),
      }),
      execute: async ({ document_id, new_name }) => {
        try {
          const id = parseId(document_id, 'document_id')
          if (typeof id !== 'string') return id

          const { data: doc } = await supabase
            .from('documents')
            .select('id, filename, deleted_at')
            .eq('id', id)
            .eq('user_id', userId)
            .single()
          if (!doc || doc.deleted_at) {
            return { error: 'Không tìm thấy tài liệu này.' }
          }

          const { data: action, error } = await supabase
            .from('chat_actions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              action_type: 'rename_document',
              document_id: id,
              payload: { old_title: doc.filename, new_name },
              status: 'pending',
            })
            .select('id')
            .single()

          if (error || !action) {
            logger.error('propose_rename_document failed', {
              err: error,
              userId,
              documentId: id,
            })
            return {
              error: 'Không tạo được đề xuất đổi tên. Thử lại hoặc đổi tên trong Kho dữ liệu.',
            }
          }

          onPendingAction({
            id: action.id,
            action_type: 'rename_document',
            document_id: id,
            filename: doc.filename,
            preview: `Tên mới: ${new_name}`,
          })

          return {
            proposal_created: true,
            action_id: action.id,
            message: 'Đề xuất đổi tên đã tạo. Báo người dùng bấm Xác nhận.',
          }
        } catch (err) {
          logger.error('propose_rename_document threw', { err, userId })
          return { error: 'Lỗi khi tạo đề xuất đổi tên.' }
        }
      },
    }),

    propose_move_document: tool({
      description:
        'Đề xuất di chuyển tài liệu vào thư mục khác (folder_id từ list_folders; null = về thư mục gốc). KHÔNG thực thi ngay — cần người dùng Xác nhận.',
      parameters: z.object({
        document_id: IdSchema.describe('ID tài liệu (lấy từ search_documents)'),
        folder_id: IdSchema.nullable().describe(
          'ID thư mục đích (lấy từ list_folders), null để chuyển về gốc'
        ),
      }),
      execute: async ({ document_id, folder_id }) => {
        try {
          const id = parseId(document_id, 'document_id')
          if (typeof id !== 'string') return id

          let folderId: string | null = null
          if (folder_id) {
            const parsedFolder = parseId(folder_id, 'folder_id')
            if (typeof parsedFolder !== 'string') return parsedFolder
            folderId = parsedFolder
          }

          const { data: doc } = await supabase
            .from('documents')
            .select('id, filename, deleted_at')
            .eq('id', id)
            .eq('user_id', userId)
            .single()
          if (!doc || doc.deleted_at) {
            return { error: 'Không tìm thấy tài liệu này.' }
          }

          let folderName = 'Thư mục gốc'
          if (folderId) {
            const { data: folder } = await supabase
              .from('folders')
              .select('id, name')
              .eq('id', folderId)
              .eq('user_id', userId)
              .single()
            if (!folder) {
              return { error: 'Thư mục đích không tồn tại. Dùng list_folders để lấy đúng ID.' }
            }
            folderName = folder.name
          }

          const { data: action, error } = await supabase
            .from('chat_actions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              action_type: 'move_document',
              document_id: id,
              payload: { title: doc.filename, folder_id: folderId, folder_name: folderName },
              status: 'pending',
            })
            .select('id')
            .single()

          if (error || !action) {
            return { error: 'Không tạo được đề xuất.' }
          }

          onPendingAction({
            id: action.id,
            action_type: 'move_document',
            document_id: id,
            filename: doc.filename,
            preview: `Chuyển vào: ${folderName}`,
          })

          return {
            proposal_created: true,
            action_id: action.id,
            message: 'Đề xuất di chuyển đã tạo. Báo người dùng bấm Xác nhận.',
          }
        } catch (err) {
          logger.error('propose_move_document threw', { err, userId })
          return { error: 'Lỗi khi tạo đề xuất di chuyển.' }
        }
      },
    }),

    propose_tag_document: tool({
      description:
        'Đề xuất gắn tag cho tài liệu (thêm vào tag hiện có, không xóa tag cũ). Tag phải tồn tại — lấy tag_id từ list_tags. KHÔNG thực thi ngay — cần người dùng Xác nhận.',
      parameters: z.object({
        document_id: IdSchema.describe('ID tài liệu (lấy từ search_documents)'),
        tag_ids: z
          .array(IdSchema)
          .min(1)
          .max(10)
          .describe('Danh sách tag_id (lấy từ list_tags)'),
      }),
      execute: async ({ document_id, tag_ids }) => {
        try {
          const id = parseId(document_id, 'document_id')
          if (typeof id !== 'string') return id

          const parsedTags: string[] = []
          for (const raw of tag_ids) {
            const tid = parseId(raw, 'tag_id')
            if (typeof tid !== 'string') return tid
            parsedTags.push(tid)
          }

          const { data: doc } = await supabase
            .from('documents')
            .select('id, filename, deleted_at')
            .eq('id', id)
            .eq('user_id', userId)
            .single()
          if (!doc || doc.deleted_at) {
            return { error: 'Không tìm thấy tài liệu này.' }
          }

          const { data: tags } = await supabase
            .from('tags')
            .select('id, name')
            .eq('user_id', userId)
            .in('id', parsedTags)
          if (!tags || tags.length !== parsedTags.length) {
            return { error: 'Một số tag không tồn tại. Dùng list_tags để lấy đúng ID.' }
          }

          const tagNames = tags.map((t) => t.name)
          const { data: action, error } = await supabase
            .from('chat_actions')
            .insert({
              user_id: userId,
              session_id: sessionId,
              action_type: 'tag_document',
              document_id: id,
              payload: { title: doc.filename, tag_ids: parsedTags, tag_names: tagNames },
              status: 'pending',
            })
            .select('id')
            .single()

          if (error || !action) {
            return { error: 'Không tạo được đề xuất.' }
          }

          onPendingAction({
            id: action.id,
            action_type: 'tag_document',
            document_id: id,
            filename: doc.filename,
            preview: `Gắn tag: ${tagNames.join(', ')}`,
          })

          return {
            proposal_created: true,
            action_id: action.id,
            message: 'Đề xuất gắn tag đã tạo. Báo người dùng bấm Xác nhận.',
          }
        } catch (err) {
          logger.error('propose_tag_document threw', { err, userId })
          return { error: 'Lỗi khi tạo đề xuất gắn tag.' }
        }
      },
    }),

    restore_note: tool({
      description:
        'Khôi phục ghi chú đã xóa (đưa ra khỏi thùng rác). Không phá hủy nên chạy ngay. Dùng khi người dùng muốn hoàn tác việc xóa.',
      parameters: z.object({
        document_id: IdSchema.optional().describe(
          'ID ghi chú; bỏ trống để khôi phục note xóa gần nhất'
        ),
      }),
      execute: async ({ document_id }) => {
        try {
          let target: { id: string; filename: string; r2_key: string } | null = null

          if (document_id) {
            const id = parseId(document_id, 'document_id')
            if (typeof id !== 'string') return id
            const { data } = await supabase
              .from('documents')
              .select('id, filename, r2_key, deleted_at')
              .eq('id', id)
              .eq('user_id', userId)
              .eq('file_type', 'note')
              .single()
            if (data?.deleted_at) target = data
          } else {
            const { data } = await supabase
              .from('documents')
              .select('id, filename, r2_key')
              .eq('user_id', userId)
              .eq('file_type', 'note')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            target = data
          }

          if (!target) {
            return { error: 'Không có ghi chú nào trong thùng rác để khôi phục.' }
          }

          const { error } = await supabase
            .from('documents')
            .update({ deleted_at: null, status: 'pending', chunk_count: null })
            .eq('id', target.id)
            .eq('user_id', userId)

          if (error) {
            return { error: 'Không khôi phục được ghi chú.' }
          }

          try {
            await enqueueIngestionJob({
              document_id: target.id,
              r2_key: target.r2_key,
              file_type: 'note',
              user_id: userId,
            })
          } catch (err) {
            logger.error('restore_note: reindex queue failed', {
              err,
              userId,
              documentId: target.id,
            })
          }

          await supabase.from('chat_actions').insert({
            user_id: userId,
            session_id: sessionId,
            action_type: 'restore_note',
            document_id: target.id,
            payload: { title: target.filename },
            status: 'executed',
            executed_at: new Date().toISOString(),
          })

          return { success: true, document_id: target.id, title: target.filename }
        } catch (err) {
          logger.error('restore_note threw', { err, userId })
          return { error: 'Lỗi khi khôi phục ghi chú.' }
        }
      },
    }),
  }
}

/** System prompt block describing note/document tools and safety rules. */
export const NOTE_TOOLS_PROMPT = `
Bạn có thể quản lý ghi chú và tài liệu của người dùng qua các tool:
- search_notes / search_documents: tìm note/tài liệu; search_documents cũng trả folders khớp tên/mô tả
- list_folders: liệt kê hoặc tìm thư mục theo tên/mô tả để lấy folder_id
- create_note: tạo note mới (chạy ngay)
- restore_note: khôi phục note đã xóa (hoàn tác, chạy ngay)
- list_tags: liệt kê tag để lấy ID
- propose_update_note / propose_delete_note: đề xuất sửa/xóa note
- propose_rename_document / propose_move_document / propose_tag_document: đề xuất đổi tên / di chuyển / gắn tag cho mọi loại tài liệu
- Các tool propose_* chỉ TẠO ĐỀ XUẤT; người dùng phải bấm Xác nhận trong giao diện thì thao tác mới được thực thi.

Quy tắc an toàn:
- Không bao giờ đoán document_id, folder_id, tag_id — phải lấy từ tool tương ứng.
- Khi đổi tên: search bằng tên HIỆN TẠI (hoặc từ khóa mô tả), KHÔNG search bằng tên mới. Ví dụ user nói "đổi báo cáo.pdf thành abc" → search "báo cáo" chứ không search "abc".
- Nếu user không nêu rõ file nào, gọi search_documents với query rỗng để lấy danh sách gần đây rồi hỏi chọn.
- Không kết luận "không có tài liệu trong kho" nếu chưa gọi search_documents/search_notes.
- Nếu tìm thấy nhiều kết quả khớp, hỏi lại người dùng chọn cái nào trước khi đề xuất.
- Mỗi lượt chỉ đề xuất tối đa 3 thao tác.
- Sau khi tạo đề xuất, tóm tắt ngắn gọn và nhắc người dùng bấm nút Xác nhận.
- Nội dung note chỉ sửa/xóa được với note; file upload (pdf, ảnh...) chỉ đổi tên/di chuyển/gắn tag được.`
