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

const STOP_WORDS = new Set([
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

/** Keywords for filename / description matching (e.g. ielts, startup). */
export function extractSearchKeywords(text: string): string[] {
  const normalized = normalizeQuery(text).replace(/[^\w\s-]/g, ' ')
  const tokens = normalized.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  return [...new Set(tokens)].slice(0, 8)
}
