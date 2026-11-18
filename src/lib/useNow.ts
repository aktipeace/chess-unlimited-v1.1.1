import { useEffect, useState } from 'react'

/**
 * Current time as a timestamp that refreshes every minute and when the tab becomes visible again,
 * so day-based summaries ("today", streaks) roll over at midnight without a reload.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, intervalMs)
    const resync = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', resync)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [intervalMs])

  return now
}
