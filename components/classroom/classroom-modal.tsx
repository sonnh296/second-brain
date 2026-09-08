'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ClassroomModal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  busy,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  busy?: boolean
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50"
      onClick={() => {
        if (!busy) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-xl border bg-background shadow-xl overflow-hidden flex flex-col',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
          <h2 className="text-base font-semibold flex-1 min-w-0 truncate">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        {footer ? <div className="shrink-0 border-t p-3">{footer}</div> : null}
      </div>
    </div>
  )
}
