export const DEFAULT_SESSION_TITLES = ['New Chat', 'Cuộc trò chuyện mới'] as const

export function titleFromFirstMessage(message: string, maxLen = 50): string {
  const oneLine = message.replace(/\s+/g, ' ').trim()
  if (!oneLine) return 'Cuộc trò chuyện mới'
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen) + '...'
}

export function isDefaultSessionTitle(title: string): boolean {
  return (DEFAULT_SESSION_TITLES as readonly string[]).includes(title)
}
