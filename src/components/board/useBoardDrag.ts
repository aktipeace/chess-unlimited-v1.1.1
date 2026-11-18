import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type DragState = { from: string; x: number; y: number; size: number }

type Options = {
  /** Only pieces for which this returns true can be picked up. */
  canDrag: (square: string) => boolean
  /** Called once the piece has really been picked up (moved a few pixels). */
  onDragStart: (square: string) => void
  /** Called when the piece is released over a different square. */
  onDrop: (from: string, to: string) => void
}

const DRAG_THRESHOLD = 6

/**
 * Drag-and-drop for board squares via Pointer Events (mouse, touch and pen).
 * A tap still works as before: the click handler should start with `if (consumeClick()) return`.
 * Squares need a `data-square` attribute; the floating piece is rendered from `drag`.
 */
export function useBoardDrag({ canDrag, onDragStart, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const options = useRef({ canDrag, onDragStart, onDrop })
  options.current = { canDrag, onDragStart, onDrop }
  const pending = useRef<{ from: string; startX: number; startY: number; size: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(suppressTimer.current), [])

  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }, [])

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    const current = pending.current
    pending.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!current?.active) return
    setDrag(null)
    // The browser still sends a click to the square the drag started on; swallow that one.
    suppressClick.current = true
    window.clearTimeout(suppressTimer.current)
    suppressTimer.current = window.setTimeout(() => { suppressClick.current = false }, 80)
    if (!commit) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-square]')
    const to = target?.getAttribute('data-square')
    if (to && to !== current.from) options.current.onDrop(current.from, to)
  }, [])

  const bind = useCallback((square: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!options.current.canDrag(square)) return
      const rect = event.currentTarget.getBoundingClientRect()
      pending.current = { from: square, startX: event.clientX, startY: event.clientY, size: rect.width, active: false }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = pending.current
      if (!current || current.from !== square) return
      if (!current.active) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return
        current.active = true
        options.current.onDragStart(square)
      }
      setDrag({ from: square, x: event.clientX, y: event.clientY, size: current.size })
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
  }), [finish])

  return { drag, bind, consumeClick }
}
