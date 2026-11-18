import { describe, expect, it } from 'vitest'
import {
  currentStreak,
  dayKey,
  emptyProgress,
  isValidItem,
  judgeMove,
  levelFor,
  pickNext,
  recordFailure,
  recordSolved,
  sanitizeProgress,
  summarize,
  type TrainingItem,
} from './trainingModel'

const FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
const item = (id: string, patch: Partial<TrainingItem> = {}): TrainingItem => ({ id, kind: 'puzzle', theme: 'mate1', fen: FEN, solution: ['a1a8'], title: id, level: 1, ...patch })
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()

describe('training progress', () => {
  it('counts a clean solve and a solve after a failure differently', () => {
    let progress = recordSolved(emptyProgress(), 'a', false, at(15))
    expect(progress.items.a).toMatchObject({ solved: true, clean: true, tries: 1 })
    progress = recordFailure(progress, 'b', at(15))
    progress = recordSolved(progress, 'b', false, at(15))
    expect(progress.items.b).toMatchObject({ solved: true, clean: false, failures: 1, tries: 2 })
    expect(recordSolved(emptyProgress(), 'c', true, at(15)).items.c.clean).toBe(false)
  })

  it('does not inflate the daily count when the same item is solved twice on one day', () => {
    let progress = recordSolved(emptyProgress(), 'a', false, at(15, 9))
    progress = recordSolved(progress, 'a', false, at(15, 20))
    expect(progress.days[dayKey(at(15))]).toBe(1)
    progress = recordSolved(progress, 'a', false, at(16))
    expect(progress.days[dayKey(at(16))]).toBe(1)
  })

  it('computes the streak, tolerating a day that has not started yet', () => {
    let progress = emptyProgress()
    for (const day of [13, 14, 15]) progress = recordSolved(progress, `p${day}`, false, at(day))
    expect(currentStreak(progress, at(15))).toBe(3)
    expect(currentStreak(progress, at(16, 8))).toBe(3) // nothing solved yet today, streak still alive
    expect(currentStreak(progress, at(17))).toBe(0) // a full day was missed
    expect(currentStreak(emptyProgress(), at(15))).toBe(0)
  })

  it('crosses month boundaries', () => {
    let progress = emptyProgress()
    progress = recordSolved(progress, 'x', false, new Date(2026, 9, 31, 12).getTime())
    progress = recordSolved(progress, 'y', false, new Date(2026, 10, 1, 12).getTime())
    expect(currentStreak(progress, new Date(2026, 10, 1, 20).getTime())).toBe(2)
  })

  it('summarises solved, clean rate, today and themes', () => {
    const items = [item('a'), item('b', { theme: 'material' }), item('c', { theme: 'mate2' })]
    let progress = recordSolved(emptyProgress(), 'a', false, at(15))
    progress = recordFailure(progress, 'b', at(15))
    progress = recordSolved(progress, 'b', false, at(15))
    const summary = summarize(items, progress, at(15))
    expect(summary).toMatchObject({ solved: 2, total: 3, cleanRate: 0.5, today: 2, streak: 1 })
    expect(summary.byTheme.mate1).toEqual({ solved: 1, total: 1 })
    expect(summary.byTheme.mate2).toEqual({ solved: 0, total: 1 })
  })
})

describe('training picking and judging', () => {
  const items = [item('hard', { level: 3 }), item('easy', { level: 1 }), item('mid', { level: 2, theme: 'material' })]

  it('serves unsolved items easiest first and respects the theme filter', () => {
    expect(pickNext(items, emptyProgress())?.id).toBe('easy')
    expect(pickNext(items, emptyProgress(), { theme: 'material' })?.id).toBe('mid')
    const progress = recordSolved(emptyProgress(), 'easy', false, at(15))
    expect(pickNext(items, progress, { excludeId: 'mid' })?.id).toBe('hard')
  })

  it('revisits the hardest solved items when everything is solved', () => {
    let progress = emptyProgress()
    for (const id of ['hard', 'easy', 'mid']) progress = recordSolved(progress, id, false, at(10))
    progress = recordFailure(progress, 'mid', at(11))
    expect(pickNext(items, progress)?.id).toBe('mid')
  })

  it('never returns the excluded item unless it is the only one', () => {
    const only = [item('solo')]
    expect(pickNext(only, emptyProgress(), { excludeId: 'solo' })?.id).toBe('solo')
    expect(pickNext([], emptyProgress())).toBeNull()
    expect(pickNext(items, emptyProgress(), { theme: 'mate3' })).toBeNull()
  })

  it('judges a multi-move solution and returns the opponent reply', () => {
    const puzzle = item('m2', { theme: 'mate2', solution: ['a1a7', 'g8f8', 'a7a8'] })
    expect(judgeMove(puzzle, 0, 'a1a7')).toEqual({ correct: true, done: false, reply: 'g8f8' })
    expect(judgeMove(puzzle, 0, 'a1a2')).toEqual({ correct: false, done: false, reply: null })
    expect(judgeMove(puzzle, 1, 'a7a8')).toEqual({ correct: true, done: true, reply: null })
  })

  it('accepts any mating move on the last step of a mate puzzle, but not of a material puzzle', () => {
    const mate = item('m1', { solution: ['a1a8'] })
    expect(judgeMove(mate, 0, 'a1b1', { givesMate: true }).correct).toBe(true)
    expect(judgeMove(mate, 0, 'a1b1', { givesMate: false }).correct).toBe(false)
    const material = item('mat', { theme: 'material', solution: ['a1a8'] })
    expect(judgeMove(material, 0, 'a1b1', { givesMate: true }).correct).toBe(false)
  })

  it('does not accept an alternative mate on an intermediate step', () => {
    const puzzle = item('m2', { theme: 'mate2', solution: ['a1a7', 'g8f8', 'a7a8'] })
    expect(judgeMove(puzzle, 0, 'a1a6', { givesMate: true }).correct).toBe(false)
  })

  it('rejects a step beyond the solution', () => {
    expect(judgeMove(item('x'), 3, 'a1a8').correct).toBe(false)
  })

  it('assigns levels from the theme and length', () => {
    expect(levelFor('mate1', 1)).toBe(1)
    expect(levelFor('mate3', 3)).toBe(3)
    expect(levelFor('material', 1)).toBe(2)
    expect(levelFor('material', 2)).toBe(3)
  })
})

describe('training validation', () => {
  it('sanitises corrupt progress', () => {
    expect(sanitizeProgress(null)).toEqual(emptyProgress())
    const clean = sanitizeProgress({ items: { a: { tries: -3, failures: 'x', solved: true, clean: true, lastAt: 5, solvedAt: 7 }, b: 4 }, days: { '2026-11-15': 2, nope: 3, '2026-11-14': -1 } })
    expect(Object.keys(clean.items)).toEqual(['a'])
    expect(clean.items.a).toMatchObject({ tries: 0, failures: 0, solved: true, solvedAt: 7 })
    expect(clean.days).toEqual({ '2026-11-15': 2 })
  })

  it('validates item structure', () => {
    expect(isValidItem(item('ok'))).toBe(true)
    expect(isValidItem(item('even', { solution: ['a1a8', 'g8f8'] }))).toBe(false)
    expect(isValidItem(item('bad', { solution: ['zz'] }))).toBe(false)
    expect(isValidItem(item('fen', { fen: 'nonsense' }))).toBe(false)
  })
})
