'use client'

import { useRef } from 'react'

const LONG_PRESS_MS = 500
const MOVE_THRESHOLD_PX = 10

interface Options {
  /** Called after a confirmed long-press. */
  onLongPress: () => void
  /** Called when the element is tapped/clicked (after press is released quickly). */
  onTap?: () => void
  disabled?: boolean
}

/**
 * Returns pointer event handlers that distinguish a long-press from a tap.
 * Long-press fires `onLongPress` and suppresses the click event.
 * Regular tap fires `onTap` (if provided) and does NOT suppress click.
 */
export function useLongPressSelect({ onLongPress, onTap, disabled }: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressNextClickRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const didLongPressRef = useRef(false)

  function cancel() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return
    // Only primary button (left-click) or touch.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Skip clicks that originate inside interactive children.
    const el = e.target as HTMLElement | null
    if (el?.closest('button,a,input,select,textarea,[role="menuitem"]')) return

    didLongPressRef.current = false
    suppressNextClickRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      didLongPressRef.current = true
      suppressNextClickRef.current = true
      onLongPress()
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return
    const dx = Math.abs(e.clientX - startRef.current.x)
    const dy = Math.abs(e.clientY - startRef.current.y)
    if (dx + dy > MOVE_THRESHOLD_PX) cancel()
  }

  function onPointerUp() {
    cancel()
  }

  function onPointerCancel() {
    cancel()
  }

  function onClick(e: React.MouseEvent) {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onTap?.()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    /** Attach this to the element's onClick. */
    onClick,
  }
}
