/** Custom type plus text/plain so Safari still advertises the drag. */
export const LIBRARY_DOC_DRAG_TYPE = 'application/x-second-brain-docs'

let draggingDocIds: string[] = []

export function beginLibraryDocDrag(ids: string[], dt: DataTransfer) {
  draggingDocIds = [...ids]
  const payload = JSON.stringify(ids)
  try {
    dt.setData(LIBRARY_DOC_DRAG_TYPE, payload)
  } catch {
    // Some browsers reject custom MIME types.
  }
  dt.setData('text/plain', payload)
  dt.effectAllowed = 'move'
}

export function isLibraryDocDrag(dt: DataTransfer): boolean {
  if (draggingDocIds.length > 0) return true
  return Array.from(dt.types).includes(LIBRARY_DOC_DRAG_TYPE)
}

function parseDocIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function readLibraryDocIds(dt: DataTransfer): string[] {
  if (draggingDocIds.length > 0) return [...draggingDocIds]
  const raw = dt.getData(LIBRARY_DOC_DRAG_TYPE) || dt.getData('text/plain')
  return raw ? parseDocIds(raw) : []
}

export function endLibraryDocDrag() {
  draggingDocIds = []
}
