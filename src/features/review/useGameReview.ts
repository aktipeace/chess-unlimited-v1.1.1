import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../analysis/gameModel'
import { isMobileViewport } from '../../lib/useIsMobile'
import { createReviewEngine, type ReviewEngine } from './reviewEngine'
import { buildReview, timelineOf, type PositionEval, type ReviewResult } from './reviewModel'

export type ReviewStatus = 'idle' | 'starting' | 'running' | 'done' | 'cancelled' | 'error'

/**
 * Runs the engine over every position of a game, one after another, and builds the review.
 * Every run gets a token; cancelling (or starting a new run, or unmounting) invalidates the
 * token so stale results are dropped and the worker is terminated.
 */
export function useGameReview() {
  const [status, setStatus] = useState<ReviewStatus>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [partial, setPartial] = useState<PositionEval[]>([])
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [singleThread, setSingleThread] = useState(false)
  const runRef = useRef(0)
  const engineRef = useRef<ReviewEngine | null>(null)

  const releaseEngine = useCallback(() => {
    engineRef.current?.dispose()
    engineRef.current = null
  }, [])

  const cancel = useCallback(() => {
    runRef.current += 1
    releaseEngine()
    setStatus((current) => (current === 'starting' || current === 'running' ? 'cancelled' : current))
  }, [releaseEngine])

  const reset = useCallback(() => {
    runRef.current += 1
    releaseEngine()
    setStatus('idle')
    setProgress({ done: 0, total: 0 })
    setPartial([])
    setResult(null)
    setError(null)
  }, [releaseEngine])

  /** Shows a review that was computed earlier (loaded from the Library) without running the engine. */
  const restore = useCallback(
    (restored: ReviewResult) => {
      runRef.current += 1
      releaseEngine()
      setResult(restored)
      setPartial(restored.positions)
      setProgress({ done: restored.positions.length, total: restored.positions.length })
      setError(null)
      setStatus('done')
    },
    [releaseEngine],
  )

  const start = useCallback(
    async (state: GameState, depth: number) => {
      runRef.current += 1
      const token = runRef.current
      releaseEngine()

      let timeline: ReturnType<typeof timelineOf>
      try {
        timeline = timelineOf(state)
      } catch {
        setError('Permainan tidak bisa dibaca ulang.')
        setStatus('error')
        return
      }
      const { fens, terminals } = timeline

      setResult(null)
      setError(null)
      setPartial([])
      setProgress({ done: 0, total: fens.length })
      setStatus('starting')

      const mobile = isMobileViewport()
      try {
        const engine = await createReviewEngine({ hash: mobile ? 32 : 64, threads: mobile ? 1 : 2, multiPv: mobile ? 1 : 2 })
        if (token !== runRef.current) {
          engine.dispose()
          return
        }
        engineRef.current = engine
        setSingleThread(engine.singleThread)
        setStatus('running')

        const positions: PositionEval[] = []
        for (let index = 0; index < fens.length; index += 1) {
          const evaluation = terminals[index] ?? (await engine.evaluate(fens[index], depth))
          if (token !== runRef.current) return
          positions.push(evaluation)
          setPartial([...positions])
          setProgress({ done: positions.length, total: fens.length })
        }

        releaseEngine()
        setResult(buildReview(state, positions))
        setStatus('done')
      } catch (caught) {
        if (token !== runRef.current) return // cancelled: nothing to report
        releaseEngine()
        setError(caught instanceof Error ? caught.message : 'Review gagal dijalankan.')
        setStatus('error')
      }
    },
    [releaseEngine],
  )

  useEffect(
    () => () => {
      runRef.current += 1
      engineRef.current?.dispose()
      engineRef.current = null
    },
    [],
  )

  return { status, progress, partial, result, error, singleThread, start, cancel, reset, restore }
}
