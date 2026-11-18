export type EngineSettings = {
  depth: number
  hash: number
  threads: number
  multiPv: number
  continuous: boolean
}

export type EngineLine = {
  multipv: number
  depth: number
  score: { type: 'cp' | 'mate'; value: number }
  pv: string[]
  bestMove?: string
}

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'line'; line: EngineLine }
  | { type: 'bestmove'; move: string; ponder?: string }
  | { type: 'status'; status: string }
  | { type: 'error'; message: string }
