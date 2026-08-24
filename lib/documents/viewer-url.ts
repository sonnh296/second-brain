export type DocumentViewerTab = 'content' | 'subtitles' | 'description' | 'details'

export interface DocumentViewerUrlOptions {
  page?: number
  tab?: DocumentViewerTab
  fromChat?: boolean
}

/** Build the full-page document viewer URL (used by chat citations). */
export function buildDocumentViewerUrl(
  documentId: string,
  options: DocumentViewerUrlOptions = {}
): string {
  const params = new URLSearchParams()
  if (options.page != null && options.page > 0) {
    params.set('page', String(options.page))
  }
  if (options.tab) {
    params.set('tab', options.tab)
  }
  if (options.fromChat) {
    params.set('from', 'chat')
  }
  const qs = params.toString()
  return `/documents/${documentId}/view${qs ? `?${qs}` : ''}`
}
