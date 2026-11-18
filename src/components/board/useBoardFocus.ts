import { useCallback, useEffect, useState } from 'react'

/** Focus mode uses native fullscreen when available and a fixed viewport fallback on iOS. */
export function useBoardFocus() {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const sync = () => setFocused(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggle = useCallback(async (element: HTMLElement | null) => {
    if (!element) return
    if (focused) {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => undefined)
      setFocused(false)
      return
    }
    setFocused(true)
    if (element.requestFullscreen) {
      try { await element.requestFullscreen() } catch { /* fixed-position fallback remains active */ }
    }
  }, [focused])
  return { focused, toggle }
}
