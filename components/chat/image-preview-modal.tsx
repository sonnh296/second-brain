'use client'

import { useState } from 'react'
import type { PreviewModal } from './types'

export function ImagePreviewModal({
  modal,
  onClose,
}: {
  modal: PreviewModal
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  if (!modal.open) return null

  async function saveToLibrary() {
    if (!modal.open || !modal.attachmentId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/chat/attachments/${modal.attachmentId}/save-to-library`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      setSaveMessage(
        res.ok ? `Đã lưu "${data.filename}" vào kho tri thức` : (data.error ?? 'Không lưu được')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={modal.src}
          alt={modal.filename}
          className="max-h-[80vh] sm:max-h-[85vh] max-w-full mx-auto object-contain bg-background"
        />
        <div className="absolute top-2 right-2 flex gap-2 flex-wrap justify-end">
          {modal.attachmentId && (
            <button
              className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors disabled:opacity-50"
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation()
                void saveToLibrary()
              }}
            >
              {saving ? 'Đang lưu…' : '💾 Lưu vào kho'}
            </button>
          )}
          <a
            href={modal.src}
            download={modal.filename}
            className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ Tải về
          </a>
          <button
            className="rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur hover:bg-background transition-colors"
            onClick={onClose}
          >
            ✕ Đóng
          </button>
        </div>
        <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-1.5 text-xs text-white truncate">
          {saveMessage ?? modal.filename}
        </p>
      </div>
    </div>
  )
}
