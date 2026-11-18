import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineLine, EngineSettings } from './engine.types'
import { isMobileViewport } from '../../lib/useIsMobile'
import { resolveEngineSettings } from '../settings/settingsModel'
import { getSettings } from '../settings/settingsStore'

const DEFAULT_SETTINGS: EngineSettings = { depth: 18, hash: 128, threads: 2, multiPv: 3, continuous: true }
// Phones have limited memory, battery and thermal headroom: one thread, small hash,
// bounded depth and fewer lines. Desktop keeps DEFAULT_SETTINGS untouched.
const MOBILE_SETTINGS: EngineSettings = { depth: 14, hash: 32, threads: 1, multiPv: 2, continuous: false }

const ENGINE_MULTI = '/engine/stockfish.js'
export const ENGINE_SINGLE = '/engine/stockfish-single.js'
const ENGINE_START_TIMEOUT_MS = 20000

function isCrossOriginIsolated() {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}

// The multi-thread build needs SharedArrayBuffer, which only exists on a cross-origin
// isolated page (HTTPS or localhost + COOP/COEP). On a phone opening the dev server over
// http://<LAN-IP> that is not the case, so try the single-thread build first. Either way the
// other build is the fallback, so one missing or blocked file does not leave the engine dead.
export function engineCandidates() {
  return isCrossOriginIsolated() ? [ENGINE_MULTI, ENGINE_SINGLE] : [ENGINE_SINGLE, ENGINE_MULTI]
}

// A worker that fails to load reports an empty error event. Ask the server what is wrong
// with the file so the message says something useful instead of a generic guess.
export async function diagnoseEngineFile(url: string): Promise<string> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return `File ${url} tidak ditemukan (HTTP ${response.status}). Jalankan "npm install" lalu "npm run dev" agar file engine disalin ke public/engine.`
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('text/html')) return `${url} mengembalikan halaman HTML, bukan engine. Jalankan "npm install" agar file engine tersalin ke public/engine.`
    if (isCrossOriginIsolated() && !response.headers.get('cross-origin-embedder-policy')) return `Server tidak mengirim header Cross-Origin-Embedder-Policy untuk ${url}, jadi browser memblokir worker engine. Pakai "npm run dev" / "npm run preview" atau atur header COOP/COEP di hosting.`
    return `Browser menolak memuat ${url} (HTTP ${response.status}, ${type || 'tanpa content-type'}). Muat ulang dengan Ctrl+Shift+R; jika memakai PWA, hapus data situs lama (Application > Service Workers > Unregister).`
  } catch {
    return `Tidak bisa mengambil ${url}. Pastikan server dev masih berjalan.`
  }
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null)
  const singleThreadRef = useRef(false)
  const lastFenRef = useRef<string | null>(null)
  const pausedRef = useRef(false)
  const analyzingRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Engine belum dimuat')
  const [lines, setLines] = useState<EngineLine[]>([])
  const [analyzedFen, setAnalyzedFen] = useState<string | null>(null)
  const [bestMove, setBestMove] = useState('—')
  // Device profile by default; the saved custom engine settings win when "auto" is switched off in Settings.
  const [settings, setSettings] = useState<EngineSettings>(() => resolveEngineSettings(getSettings(), isMobileViewport() ? MOBILE_SETTINGS : DEFAULT_SETTINGS))
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let handshakeComplete = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const candidates = engineCandidates()

    const start = (index: number) => {
      clearTimeout(watchdog)
      const isLast = index === candidates.length - 1
      singleThreadRef.current = candidates[index] === ENGINE_SINGLE
      setStatus('Memuat Stockfish WASM...')
      const worker = new Worker(candidates[index])
      workerRef.current = worker

      // Move on to the next candidate build if this one fails or stays silent.
      const fallback = () => {
        if (isLast || handshakeComplete || disposed) return false
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
        start(index + 1)
        return true
      }
      if (!isLast) watchdog = setTimeout(fallback, ENGINE_START_TIMEOUT_MS)

      worker.onmessage = (event: MessageEvent<string>) => {
        const raw = String(event.data).trim()
        if (raw === 'uciok') {
          worker.postMessage('isready')
          return
        }
        if (raw === 'readyok') {
          handshakeComplete = true
          clearTimeout(watchdog)
          setReady(true)
          setStatus('Stockfish siap')
          return
        }
        if (raw.startsWith('info ')) {
          setIsAnalyzing(true)
          setStatus('Analisis posisi terbaru berjalan...')
          const depth = Number(raw.match(/\bdepth (\d+)/)?.[1] ?? 0)
          const multipv = Number(raw.match(/\bmultipv (\d+)/)?.[1] ?? 1)
          const cp = raw.match(/\bscore cp (-?\d+)/)
          const mate = raw.match(/\bscore mate (-?\d+)/)
          const pv = raw.match(/\bpv (.+)$/)?.[1]?.split(/\s+/) ?? []
          if ((cp || mate) && pv.length) {
            const line: EngineLine = {
              depth,
              multipv,
              score: cp ? { type: 'cp', value: Number(cp[1]) } : { type: 'mate', value: Number(mate?.[1]) },
              pv,
              bestMove: pv[0],
            }
            setLines((current) => [...current.filter((item) => item.multipv !== multipv), line].sort((a, b) => a.multipv - b.multipv))
            if (multipv === 1) setBestMove(pv[0])
          }
          return
        }
        if (raw.startsWith('bestmove ')) {
          const parts = raw.split(/\s+/)
          setBestMove(parts[1] ?? '—')
          setIsAnalyzing(false)
          setStatus('Analisis selesai')
        }
      }
      worker.onerror = (event) => {
        if (fallback()) return
        setStatus('Engine bermasalah')
        if (event.message) {
          setError(event.message)
          return
        }
        void diagnoseEngineFile(candidates[0]).then((detail) => {
          if (!disposed) setError(`Stockfish WASM gagal dimuat. ${detail}`)
        })
      }
      worker.postMessage('uci')
    }
    start(0)

    return () => {
      disposed = true
      clearTimeout(watchdog)
      const worker = workerRef.current
      if (worker) {
        if (handshakeComplete) worker.postMessage('stop')
        worker.terminate()
      }
      workerRef.current = null
    }
  }, [])

  const analyze = useCallback((fen: string) => {
    const worker = workerRef.current
    if (!worker || !ready) return
    lastFenRef.current = fen
    setAnalyzedFen(fen)
    setLines([])
    setBestMove('Mencari...')
    setIsAnalyzing(true)
    setError(null)
    // Stop the previous infinite search before changing the position.
    worker.postMessage('stop')
    worker.postMessage('ucinewgame')
    worker.postMessage(`setoption name Hash value ${settings.hash}`)
    worker.postMessage(`setoption name Threads value ${singleThreadRef.current ? 1 : settings.threads}`)
    worker.postMessage(`setoption name MultiPV value ${settings.multiPv}`)
    worker.postMessage(`position fen ${fen}`)
    worker.postMessage(settings.continuous ? 'go infinite' : `go depth ${settings.depth}`)
    setStatus(settings.continuous ? 'Analisis berjalan — tekan Stop untuk mengakhiri' : `Menganalisis sampai depth ${settings.depth}...`)
  }, [ready, settings])

  const stop = useCallback(() => {
    if (!isAnalyzing) return
    workerRef.current?.postMessage('stop')
    setStatus('Menghentikan analisis...')
  }, [isAnalyzing])

  const reset = useCallback(() => {
    if (isAnalyzing) {
      workerRef.current?.postMessage('stop')
      setStatus('Menghentikan analisis sebelum reset...')
    } else {
      workerRef.current?.postMessage('ucinewgame')
      setStatus(ready ? 'Stockfish siap' : 'Memuat Stockfish...')
    }
    setLines([])
    setAnalyzedFen(null)
    setBestMove('—')
  }, [isAnalyzing, ready])

  const analyzeRef = useRef(analyze)
  useEffect(() => { analyzeRef.current = analyze }, [analyze])
  useEffect(() => { analyzingRef.current = isAnalyzing }, [isAnalyzing])

  // Phones only: stop the search while the page is in the background (saves battery and
  // heat) and restart it for the last position when the user comes back.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!isMobileViewport()) return
      if (document.hidden) {
        if (analyzingRef.current) {
          pausedRef.current = true
          workerRef.current?.postMessage('stop')
        }
      } else if (pausedRef.current) {
        pausedRef.current = false
        if (lastFenRef.current) analyzeRef.current(lastFenRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return { ready, status, lines, analyzedFen, bestMove, settings, setSettings, isAnalyzing, error, analyze, stop, reset }
}
