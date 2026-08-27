'use client'

import { useCallback, useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** When set, shows a third action (e.g. "Không lưu") between cancel and confirm. */
  discardLabel?: string
  variant?: 'default' | 'destructive'
}

export type ConfirmChoice = 'confirm' | 'discard' | 'cancel'

type ConfirmState = ConfirmOptions & {
  resolve: (value: ConfirmChoice) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  discardLabel,
  variant = 'destructive',
  onConfirm,
  onCancel,
  onDiscard,
}: ConfirmOptions & {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onDiscard?: () => void
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
        <CardFooter className="justify-end gap-2 flex-wrap">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {discardLabel && onDiscard && (
            <Button type="button" variant="outline" size="sm" onClick={onDiscard}>
              {discardLabel}
            </Button>
          )}
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

  const close = useCallback((value: ConfirmChoice) => {
    setState((prev) => {
      prev?.resolve(value)
      return null
    })
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        ...opts,
        resolve: (choice) => resolve(choice === 'confirm'),
      })
    })
  }, [])

  const confirmChoice = useCallback((opts: ConfirmOptions) => {
    return new Promise<ConfirmChoice>((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title ?? ''}
      description={state?.description}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      discardLabel={state?.discardLabel}
      variant={state?.variant}
      onConfirm={() => close('confirm')}
      onCancel={() => close('cancel')}
      onDiscard={state?.discardLabel ? () => close('discard') : undefined}
    />
  )

  return { confirm, confirmChoice, dialog }
}
