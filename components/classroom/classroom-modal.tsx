'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function shouldBlockSpaceScroll(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false
  if (target.isContentEditable) return false
  const tag = target.tagName
  if (tag === 'BUTTON' || tag === 'A' || target.getAttribute('role') === 'button') return false
  return true
}

export function ClassroomModal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  overlayClassName,
  busy,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** e.g. z-[60] when stacking above another modal */
  overlayClassName?: string
  busy?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the first text field when the modal opens. Native autoFocus is flaky after a
  // button click, so Space sometimes scrolls the page instead of typing in the input.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      const root = panelRef.current
      if (!root) return
      const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
      )
      if (!el) return
      el.focus()
      el.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onClose()
        return
      }
      if (e.key === ' ' && shouldBlockSpaceScroll(e.target)) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50',
        overlayClassName
      )}
      onClick={() => {
        if (!busy) onClose()
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
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
        <div className="p-4 space-y-3 overflow-y-auto max-h-[min(70vh,560px)]">{children}</div>
        {footer ? <div className="shrink-0 border-t p-3">{footer}</div> : null}
      </div>
    </div>
  )
}
