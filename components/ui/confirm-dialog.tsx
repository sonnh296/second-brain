'use client'

import { useCallback, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'destructive',
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <Card
        className="w-full max-w-sm shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2">
          <CardTitle id="confirm-dialog-title" className="text-base">
            {title}
          </CardTitle>
        </CardHeader>
        {description && (
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </CardContent>
        )}
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((value: boolean) => {
    setState((prev) => {
      prev?.resolve(value)
      return null
    })
  }, [])

  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title ?? ''}
      description={state?.description}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      variant={state?.variant}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )

  return { confirm, dialog }
}
