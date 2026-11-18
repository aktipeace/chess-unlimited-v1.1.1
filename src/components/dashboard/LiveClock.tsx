import { useEffect, useState } from 'react'

const ZONE_NAMES: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

const pad = (value: number) => String(value).padStart(2, '0')

function zoneLabel(now: Date): string {
  let zone = ''
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* keep empty */ }
  if (ZONE_NAMES[zone]) return ZONE_NAMES[zone]
  try {
    return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** Live clock for the home screen: updates on every second boundary and resyncs when the tab returns. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number | undefined
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 1000 - (Date.now() % 1000) + 5)
    }
    schedule()
    const resync = () => { if (!document.hidden) setNow(new Date()) }
    document.addEventListener('visibilitychange', resync)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [])

  const date = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  return (
    <div className="live-clock" role="timer" aria-label="Jam saat ini">
      <time className="live-clock-time" dateTime={now.toISOString()}>{pad(now.getHours())}<i>:</i>{pad(now.getMinutes())}<i>:</i><span>{pad(now.getSeconds())}</span></time>
      <span className="live-clock-zone">{zoneLabel(now)}</span>
      <span className="live-clock-date">{date}</span>
    </div>
  )
}
