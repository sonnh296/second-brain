const GREETING_RE =
  /^(xin chào|chào bạn|chào|hello|hi|hey|good morning|good evening|good afternoon)[\s!.?,\-]*$/i

const INVENTORY_PHRASES = [
  'co tai lieu',
  'co file',
  'da upload',
  'da tai',
  'tai lieu nao',
  'file nao',
  'danh sach tai lieu',
  'liet ke',
  'trong kho',
  'knowledge base',
]

/** Document management via chat tools — skip RAG retrieval for these. */
const MANAGEMENT_PHRASES = [
  'doi ten',
  'rename',
  'dat ten',
  'thay ten',
  'di chuyen',
  'chuyen vao',
  'chuyen file',
  'move',
  'gan tag',
  'them tag',
  'tag cho',
  'xoa note',
  'xoa ghi chu',
  'sua note',
  'sua ghi chu',
  'chinh sua',
  'sua lai',
  'edit note',
  'update note',
  'cap nhat note',
  'cap nhat ghi chu',
  'tao note',
  'tao ghi chu',
  'viet note',
  'viet ghi chu',
  'khoi phuc note',
  'khoi phuc ghi chu',
  'restore note',
]

export const STOP_WORDS = new Set([
  'tôi',
  'toi',
  'có',
  'co',
  'không',
  'khong',
  'nào',
  'nao',
  'gì',
  'gi',
  'về',
  've',
  'của',
  'cua',
  'trong',
  'kho',
  'tài',
  'tai',
  'liệu',
  'lieu',
  'file',
  'document',
  'documents',
  'upload',
  'đã',
  'da',
  'tải',
  'lên',
  'len',
  'hỏi',
  'hoi',
  'cho',
  'mình',
  'minh',
  'bạn',
  'ban',
  'any',
  'have',
  'the',
  'a',
  'an',
])

function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isGreeting(text: string): boolean {
  return GREETING_RE.test(text.trim())
}

export function isDocumentInventoryQuery(text: string): boolean {
  const t = normalizeQuery(text.trim())
  if (INVENTORY_PHRASES.some((p) => t.includes(p))) return true
  return /\bco\b.+\bkhong\b\s*[?.!]*$/i.test(t)
}

/**
 * True when the user is asking to create/edit/rename/move/tag/delete documents
 * via chat tools — RAG chunk search is irrelevant and can mislead the model.
 */
export function isDocumentManagementQuery(text: string): boolean {
  const t = normalizeQuery(text.trim())
  return MANAGEMENT_PHRASES.some((p) => t.includes(p))
}

/** Keywords for filename / description matching (e.g. ielts, startup). */
export function extractSearchKeywords(text: string): string[] {
  const normalized = normalizeQuery(text).replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  const tokens = normalized.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  return [...new Set(tokens)].slice(0, 8)
}
