import { ENGINE_SINGLE, diagnoseEngineFile, engineCandidates } from '../analysis/useStockfish'
import { isMobileViewport } from '../../lib/useIsMobile'
import type { BotCandidate } from './botModel'

const START_TIMEOUT_MS = 20000

type Pending = { resolve: (candidates: BotCandidate[]) => void; lines: Map<number, { depth: number; move: string; cp: number }> }

/** A small Stockfish wrapper that returns the top candidate moves for a position. */
export class BotEngine {
  private worker: Worker | null = null
  private disposed = false
  private pending: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  readonly ready: Promise<void>

  constructor() {
    this.ready = this.boot()
  }

  private boot(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const candidates = engineCandidates()
      let handshake = false

      const start = (index: number) => {
        const isLast = index === candidates.length - 1
        const single = candidates[index] === ENGINE_SINGLE
        const worker = new Worker(candidates[index])
        this.worker = worker
        let timer: ReturnType<typeof setTimeout> | undefined

        const fallback = () => {
          if (isLast || handshake || this.disposed) return false
          clearTimeout(timer)
          worker.onmessage = null
          worker.onerror = null
          worker.terminate()
          start(index + 1)
          return true
        }
        if (!isLast) timer = setTimeout(fallback, START_TIMEOUT_MS)

        worker.onmessage = (event: MessageEvent<string>) => {
          const raw = String(event.data).trim()
          if (raw === 'uciok') {
            worker.postMessage(`setoption name Threads value ${single || isMobileViewport() ? 1 : 2}`)
            worker.postMessage(`setoption name Hash value ${isMobileViewport() ? 16 : 64}`)
            worker.postMessage('isready')
          } else if (raw === 'readyok' && !handshake) {
            handshake = true
            clearTimeout(timer)
            resolve()
          } else if (raw.startsWith('info ')) this.onInfo(raw)
          else if (raw.startsWith('bestmove ')) this.onBestMove(raw)
        }
        worker.onerror = (event) => {
          if (fallback()) return
          clearTimeout(timer)
          if (event.message) reject(new Error(event.message))
          else void diagnoseEngineFile(candidates[0]).then((detail) => reject(new Error(`Stockfish gagal dimuat. ${detail}`)))
        }
        worker.postMessage('uci')
      }
      start(0)
    })
  }

  private onInfo(raw: string) {
    const pending = this.pending
    if (!pending) return
    const depth = Number(raw.match(/\bdepth (\d+)/)?.[1] ?? 0)
    const multipv = Number(raw.match(/\bmultipv (\d+)/)?.[1] ?? 1)
    const cp = raw.match(/\bscore cp (-?\d+)/)
    const mate = raw.match(/\bscore mate (-?\d+)/)
    const move = raw.match(/\bpv (\S+)/)?.[1]
    if (!move || (!cp && !mate)) return
    const mateValue = mate ? Number(mate[1]) : 0
    const value = cp ? Number(cp[1]) : mateValue > 0 ? 10000 - mateValue : -10000 - mateValue
    const previous = pending.lines.get(multipv)
    if (!previous || depth >= previous.depth) pending.lines.set(multipv, { depth, move, cp: value })
  }

  private onBestMove(raw: string) {
    const pending = this.pending
    this.pending = null
    if (!pending) return
    const candidates = [...pending.lines.values()].map(({ move, cp }) => ({ move, cp }))
    const fallbackMove = raw.split(/\s+/)[1]
    pending.resolve(candidates.length ? candidates : fallbackMove && fallbackMove !== '(none)' ? [{ move: fallbackMove, cp: 0 }] : [])
  }

  /** Top `multiPv` candidate moves for the position, searched to `depth` (capped by `maxMs`). */
  analyze(fen: string, depth: number, multiPv: number, maxMs = 3000): Promise<BotCandidate[]> {
    const run = async () => {
      await this.ready
      const worker = this.worker
      if (!worker || this.disposed) return []
      return new Promise<BotCandidate[]>((resolve) => {
        this.pending = { resolve, lines: new Map() }
        worker.postMessage(`setoption name MultiPV value ${multiPv}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${depth} movetime ${isMobileViewport() ? Math.min(maxMs, 2000) : maxMs}`)
      })
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** Stops a running search; the pending analyze() still resolves with what it has. */
  stop() {
    if (this.pending) this.worker?.postMessage('stop')
  }

  dispose() {
    this.disposed = true
    this.pending?.resolve([])
    this.pending = null
    this.worker?.terminate()
    this.worker = null
  }
}
