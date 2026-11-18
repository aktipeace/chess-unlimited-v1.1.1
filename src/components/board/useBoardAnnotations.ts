import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent } from 'react'
import type { Square } from 'chess.js'

export type UserBoardArrow = { from: Square; to: Square; color: string }

/** Right-click + drag to add/remove analysis arrows, matching familiar chess-board controls. */
export function useBoardAnnotations() {
  const [arrows, setArrows] = useState<UserBoardArrow[]>([])
  const start = useRef<Square | null>(null)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 2) return
    const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square as Square | undefined
    if (!square) return
    event.preventDefault()
    start.current = square
  }, [])

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('[data-square]')) event.preventDefault()
  }, [])

  useEffect(() => {
    function finish(event: PointerEvent) {
      const from = start.current
      if (!from || event.button !== 2) return
      start.current = null
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-square]')
      const to = target?.dataset.square as Square | undefined
      if (!to || to === from) return
      setArrows((current) => current.some((arrow) => arrow.from === from && arrow.to === to)
        ? current.filter((arrow) => !(arrow.from === from && arrow.to === to))
        : [...current, { from, to, color: '#f5b82e' }])
    }
    function cancel() { start.current = null }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel) }
  }, [])

  return { arrows, clearArrows: () => setArrows([]), onPointerDown, onContextMenu }
}
