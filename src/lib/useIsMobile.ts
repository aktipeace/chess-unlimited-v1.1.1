import { useEffect, useState } from 'react'

// Must match the mobile breakpoint in src/styles/global.css (max-width: 760px).
export const MOBILE_QUERY = '(max-width: 760px)'

function canMatchMedia() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

export function isMobileViewport(): boolean {
  return canMatchMedia() && window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileViewport)

  useEffect(() => {
    if (!canMatchMedia()) return
    const query = window.matchMedia(MOBILE_QUERY)
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return mobile
}
