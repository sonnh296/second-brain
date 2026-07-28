export function putToR2WithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Tải lên kho lưu trữ thất bại (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải lên kho lưu trữ'))
    xhr.send(file)
  })
}

export async function waitForDocumentProcessing(
  documentId: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const maxWaitMs = 10 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`/api/documents/status?ids=${documentId}`)
    if (!res.ok) break
    const updates = (await res.json()) as Record<
      string,
      { status: string; error_message: string | null }
    >
    const update = updates[documentId]
    if (!update) break
    if (update.status === 'done') return
    if (update.status === 'failed') {
      throw new Error(update.error_message ?? 'Tạo phụ đề thất bại')
    }
    onProgress?.(
      update.status === 'processing' ? 'Đang tạo phụ đề...' : 'Đang chờ xử lý...'
    )
    await new Promise((r) => setTimeout(r, 2000))
  }
}
