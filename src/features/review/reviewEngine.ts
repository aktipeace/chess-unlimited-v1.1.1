import { parseInfoScore, toWhiteEval, type ParsedInfo, type PositionEval } from './reviewModel'

/**
 * A small promise-based Stockfish wrapper used only by Game Review. It owns its own Worker, so
 * it never interferes with the live engine in the Analysis Studio, and it is terminated as soon
 * as the review finishes or is cancelled.
 */

const ENGINE_MULTI = '/engine/stockfish.js'
const ENGINE_SINGLE = '/engine/stockfish-single.js'
const START_TIMEOUT_MS = 20000

export type ReviewEngine = {
  /** True when the single-thread build is in use (page not cross-origin isolated). */
  singleThread: boolean
  /** Searches `fen` to `depth` and resolves with a White-relative evaluation. */
  evaluate: (fen: string, depth: number) => Promise<PositionEval>
  dispose: () => void
}

export type ReviewEngineOptions = { hash: number; threads: number; /** 2 also searches the second-best move (used to spot "only moves"). */ multiPv?: number }

function isCrossOriginIsolated() {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}

// Same strategy as the live engine: the multi-thread build needs SharedArrayBuffer, so on
// pages that are not cross-origin isolated (e.g. http://<LAN-IP> on a phone) try single first.
function candidates() {
  return isCrossOriginIsolated() ? [ENGINE_MULTI] : [ENGINE_SINGLE, ENGINE_MULTI]
}

function wire(worker: Worker, singleThread: boolean, multiPv: number): ReviewEngine {
  let pending: { reject: (error: Error) => void } | null = null
  let disposed = false

  worker.postMessage('ucinewgame')
  worker.postMessage(`setoption name MultiPV value ${multiPv}`)
  worker.onerror = (event) => {
    pending?.reject(new Error(event.message || 'Engine mengalami error.'))
    pending = null
  }

  return {
    singleThread,
    evaluate(fen, depth) {
      return new Promise<PositionEval>((resolve, reject) => {
        if (disposed) {
          reject(new Error('Engine dihentikan.'))
          return
        }
        const turn: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w'
        let latest: ParsedInfo | null = null
        let second: ParsedInfo | null = null
        pending = { reject }
        worker.onmessage = (event: MessageEvent<string>) => {
          const raw = String(event.data).trim()
          if (raw.startsWith('info ')) {
            const info = parseInfoScore(raw)
            if (info && info.multipv === 1) latest = info
            else if (info && info.multipv === 2) second = info
            return
          }
          if (raw.startsWith('bestmove ')) {
            worker.onmessage = null
            pending = null
            if (!latest) {
              reject(new Error('Engine tidak mengirim skor untuk posisi ini.'))
              return
            }
            const move = raw.split(/\s+/)[1]
            const best = move && move !== '(none)' ? move : latest.pv[0] ?? null
            const evaluation = toWhiteEval(latest.score, turn, best)
            if (multiPv > 1 && second) evaluation.second = toWhiteEval(second.score, turn, null).cp
            resolve(evaluation)
          }
        }
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${depth}`)
      })
    },
    dispose() {
      disposed = true
      pending?.reject(new Error('Engine dihentikan.'))
      pending = null
      worker.onmessage = null
      worker.terminate()
    },
  }
}

/** Starts a worker, completes the UCI handshake and resolves with a ready engine. */
export function createReviewEngine(options: ReviewEngineOptions): Promise<ReviewEngine> {
  const list = candidates()
  return new Promise<ReviewEngine>((resolve, reject) => {
    let settled = false

    const attempt = (index: number) => {
      const isLast = index === list.length - 1
      const single = list[index] === ENGINE_SINGLE
      const worker = new Worker(list[index])
      let watchdog: ReturnType<typeof setTimeout> | undefined

      const fail = (message: string) => {
        clearTimeout(watchdog)
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
        if (settled) return
        if (!isLast) {
          attempt(index + 1)
          return
        }
        settled = true
        reject(
          new Error(
            isCrossOriginIsolated()
              ? message
              : 'Stockfish multi-thread tidak bisa berjalan di koneksi non-HTTPS. Jalankan "npm install" agar build single-thread tersedia di public/engine, atau buka aplikasi lewat HTTPS/localhost.',
          ),
        )
      }

      if (!isLast) watchdog = setTimeout(() => fail('Engine tidak merespons.'), START_TIMEOUT_MS)
      worker.onerror = (event) => fail(event.message || 'Stockfish WASM gagal dimuat.')
      worker.onmessage = (event: MessageEvent<string>) => {
        const raw = String(event.data).trim()
        if (raw === 'uciok') {
          worker.postMessage(`setoption name Threads value ${single ? 1 : options.threads}`)
          worker.postMessage(`setoption name Hash value ${options.hash}`)
          worker.postMessage('isready')
        } else if (raw === 'readyok') {
          clearTimeout(watchdog)
          settled = true
          worker.onmessage = null
          resolve(wire(worker, single, options.multiPv ?? 1))
        }
      }
      worker.postMessage('uci')
    }

    attempt(0)
  })
}
