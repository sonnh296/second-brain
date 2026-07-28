'use client'

import type { PendingChatAction } from '@/lib/db/types'

const ACTION_LABELS: Record<string, { label: string; icon: string; destructive: boolean }> = {
  update_note: { label: 'Cập nhật ghi chú', icon: '✏️', destructive: false },
  delete_note: { label: 'Xóa ghi chú', icon: '🗑️', destructive: true },
  rename_document: { label: 'Đổi tên tài liệu', icon: '🏷️', destructive: false },
  move_document: { label: 'Di chuyển tài liệu', icon: '📁', destructive: false },
  tag_document: { label: 'Gắn tag', icon: '🔖', destructive: false },
}

export function PendingActionCard({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: PendingChatAction
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const meta = ACTION_LABELS[action.action_type] ?? {
    label: action.action_type,
    icon: '⚙️',
    destructive: false,
  }
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 mb-2">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {meta.label}: <span className="break-words">{action.filename}</span>
          </p>
          {action.preview && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
              {action.preview}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-2 justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`px-3 py-1.5 text-xs rounded-md text-white transition-colors disabled:opacity-50 ${
            meta.destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {busy ? 'Đang xử lý…' : 'Xác nhận'}
        </button>
      </div>
    </div>
  )
}
