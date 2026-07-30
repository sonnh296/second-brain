import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerSupabaseClient } from '@/lib/db/server'
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models'
import { fromAiSdkUsage, logUsage } from '@/lib/usage/log'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const MAX_DOCS = 40
const MAX_NOTE_CHARS = 800
const MAX_DESC_CHARS = 200
const MAX_PROMPT_CHARS = 28_000

type DocRow = {
  id: string
  filename: string
  file_type: string
  description: string | null
  note_content: string | null
  created_at: string
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

function buildInventoryBlock(docs: DocRow[]): string {
  const lines: string[] = []
  for (const d of docs) {
    const parts = [
      `- [${d.file_type}] ${d.filename} (tạo: ${d.created_at.slice(0, 10)})`,
    ]
    if (d.description?.trim()) {
      parts.push(`  Mô tả: ${truncate(d.description, MAX_DESC_CHARS)}`)
    }
    if (d.note_content?.trim()) {
      parts.push(`  Nội dung: ${truncate(d.note_content, MAX_NOTE_CHARS)}`)
    }
    lines.push(parts.join('\n'))
  }
  let text = lines.join('\n')
  if (text.length > MAX_PROMPT_CHARS) {
    text = text.slice(0, MAX_PROMPT_CHARS) + '\n… (đã cắt bớt)'
  }
  return text
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimit(`user:${user.id}`, 'library_summary', 10, 3600)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều lần tóm tắt. Vui lòng thử lại sau.' },
      { status: 429 }
    )
  }

  let { data: docs, error } = await supabase
    .from('documents')
    .select('id, filename, file_type, description, note_content, created_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_DOCS)

  if (error && (error.code === '42703' || error.message?.includes('deleted_at'))) {
    ;({ data: docs, error } = await supabase
      .from('documents')
      .select('id, filename, file_type, description, note_content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_DOCS))
  }

  if (error) {
    logger.error('Summarize: failed to load documents', { err: error, userId: user.id })
    return NextResponse.json({ error: 'Không tải được tài liệu' }, { status: 500 })
  }

  if (!docs?.length) {
    return NextResponse.json({
      summary:
        '## Tổng quan\n\nKho dữ liệu đang trống. Hãy thêm ghi chú hoặc tải tài liệu lên để có bản tóm tắt.',
    })
  }

  const inventory = buildInventoryBlock(docs as DocRow[])
  const today = new Date().toISOString().slice(0, 10)

  try {
    const { text, usage } = await generateText({
      model: anthropic(DEFAULT_CHAT_MODEL),
      maxTokens: 900,
      temperature: 0.3,
      prompt: [
        'Bạn là trợ lý tóm tắt kho tri thức cá nhân.',
        `Hôm nay là ${today} (UTC).`,
        '',
        'Dựa trên danh sách tài liệu/ghi chú bên dưới, viết bản tóm tắt NGẮN, TƯỜNG MINH bằng tiếng Việt (Markdown).',
        '',
        'Cấu trúc bắt buộc:',
        '## Nội dung chính',
        '- 3–6 gạch đầu dòng về chủ đề / nội dung nổi bật',
        '## Kế hoạch sắp tới',
        '- Việc/ngày sắp tới nếu suy ra được từ nội dung; nếu không có thì ghi "Không thấy kế hoạch cụ thể."',
        '## Quá hạn / cần chú ý',
        '- Chỉ nêu hạn hoặc việc quá hạn khi tài liệu đề cập RÕ ngày/hạn. Không bịa ngày.',
        '- Nếu không có: "Không thấy mục quá hạn rõ ràng."',
        '',
        'Quy tắc: không bịa; ngắn gọn; không lặp lại toàn bộ nội dung từng file.',
        '',
        '<documents>',
        inventory,
        '</documents>',
      ].join('\n'),
    })

    const tokens = fromAiSdkUsage(usage)
    await logUsage({
      userId: user.id,
      purpose: 'chat',
      model: DEFAULT_CHAT_MODEL,
      ...tokens,
      metadata: { feature: 'library_summary', doc_count: docs.length },
    })

    return NextResponse.json({
      summary: text.trim() || 'Không tạo được tóm tắt.',
      doc_count: docs.length,
    })
  } catch (err) {
    logger.error('Summarize: LLM failed', { err, userId: user.id })
    return NextResponse.json({ error: 'Tóm tắt AI thất bại. Thử lại sau.' }, { status: 500 })
  }
}
