export const CHAT_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Nhanh, tiết kiệm' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Cân bằng' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', description: 'Mạnh nhất' },
] as const

export type ChatModelId = (typeof CHAT_MODELS)[number]['id']

export const DEFAULT_CHAT_MODEL: ChatModelId = 'claude-haiku-4-5'

export function isValidChatModel(model: string): model is ChatModelId {
  return CHAT_MODELS.some((m) => m.id === model)
}
