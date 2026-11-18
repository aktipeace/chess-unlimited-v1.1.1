// Promise-based Stockfish driver for Node (data-building scripts only).
// Runs the same stockfish.js/.wasm that the browser app ships in public/engine.
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export class Engine {
  constructor({ hash = 64, threads = 1 } = {}) {
    const dir = join(tmpdir(), 'chess-unlimited-sf')
    mkdirSync(dir, { recursive: true })
    const source = resolve('public/engine')
    // The package is "type": "module"; the engine is a classic script, so give it a .cjs name.
    copyFileSync(join(source, 'stockfish.js'), join(dir, 'stockfish.cjs'))
    copyFileSync(join(source, 'stockfish.wasm'), join(dir, 'stockfish.wasm'))
    this.proc = spawn(process.execPath, [join(dir, 'stockfish.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.buffer = ''
    this.waiters = []
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString()
      let index
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim()
        this.buffer = this.buffer.slice(index + 1)
        if (line) this.dispatch(line)
      }
    })
    this.proc.stderr.on('data', () => {})
    this.hash = hash
    this.threads = threads
  }
  dispatch(line) {
    for (const waiter of [...this.waiters]) if (waiter(line)) this.waiters.splice(this.waiters.indexOf(waiter), 1)
  }
  send(command) { this.proc.stdin.write(command + '\n') }
  /** Sends `command` and collects lines until `until(line)` is true. */
  run(command, until) {
    return new Promise((resolveRun) => {
      const lines = []
      this.waiters.push((line) => {
        lines.push(line)
        if (until(line)) { resolveRun(lines); return true }
        return false
      })
      this.send(command)
    })
  }
  async init() {
    await this.run('uci', (l) => l === 'uciok')
    this.send(`setoption name Threads value ${this.threads}`)
    this.send(`setoption name Hash value ${this.hash}`)
    await this.run('isready', (l) => l === 'readyok')
    return this
  }
  async newGame() {
    this.send('ucinewgame')
    await this.run('isready', (l) => l === 'readyok')
  }
  /** Legal moves according to Stockfish itself (go perft 1). */
  async legal(fen) {
    this.send(`position fen ${fen}`)
    const lines = await this.run('go perft 1', (l) => l.startsWith('Nodes searched'))
    return lines.filter((l) => /^[a-h][1-8][a-h][1-8][qrbn]?: 1$/.test(l)).map((l) => l.split(':')[0])
  }
  async perft(fen, depth) {
    this.send(`position fen ${fen}`)
    const lines = await this.run(`go perft ${depth}`, (l) => l.startsWith('Nodes searched'))
    return Number(lines[lines.length - 1].split(':')[1])
  }
  /**
   * Searches `fen` to `depth` with `multipv` lines. Scores are converted to the SIDE TO MOVE's point of
   * view (Stockfish's native convention). Returns lines sorted by multipv with the deepest info for each.
   */
  async search(fen, depth, multipv = 1) {
    this.send(`setoption name MultiPV value ${multipv}`)
    this.send(`position fen ${fen}`)
    const lines = await this.run(`go depth ${depth}`, (l) => l.startsWith('bestmove'))
    const best = new Map()
    for (const line of lines) {
      if (!line.startsWith('info ') || /\b(lowerbound|upperbound)\b/.test(line)) continue
      const cp = line.match(/\bscore cp (-?\d+)/)
      const mate = line.match(/\bscore mate (-?\d+)/)
      const pv = line.match(/\bpv (.+)$/)?.[1]?.split(/\s+/)
      if ((!cp && !mate) || !pv) continue
      const index = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1)
      const d = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0)
      const previous = best.get(index)
      if (!previous || d >= previous.depth) best.set(index, { multipv: index, depth: d, cp: cp ? Number(cp[1]) : null, mate: mate ? Number(mate[1]) : null, pv })
    }
    const last = lines[lines.length - 1].split(/\s+/)[1]
    return { lines: [...best.values()].sort((a, b) => a.multipv - b.multipv), bestmove: last === '(none)' ? null : last }
  }
  quit() { try { this.send('quit') } catch {} this.proc.kill() }
}
