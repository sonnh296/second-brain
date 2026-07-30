'use client'

import type { ReactNode } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type DialogProps = {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  maxWidth?: string
}

/** Lightweight modal — same overlay pattern as ConfirmDialog. */
export function Dialog({
  open,
  title,
  children,
  footer,
  onClose,
  maxWidth = 'max-w-md',
}: DialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <Card
        className={`w-full ${maxWidth} shadow-lg max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 shrink-0 flex flex-row items-center justify-between gap-2">
          <CardTitle id="dialog-title" className="text-base">
            {title}
          </CardTitle>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            ×
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto flex-1 min-h-0">{children}</CardContent>
        {footer && (
          <CardFooter className="justify-end gap-2 shrink-0 border-t pt-3">{footer}</CardFooter>
        )}
      </Card>
    </div>
  )
}
