import { describe, expect, it } from 'vitest'
import type { CountMap, SavedGame, StoredReview } from '../library/libraryModel'
import { PUZZLES } from '../training/puzzleData'
import { MISTAKE_ID_PREFIX, trainingLink, trainingPool } from '../training/trainingItems'
import { emptyProgress, isValidItem, type Attempt, type TrainingItem, type TrainingProgress } from '../training/trainingModel'
import { activitySummary, continueLearning, greetingFor, moveQuality, recentGames, recommendations, relativeDay } from './dashboardModel'

// Tuesday 17 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0).getTime()
const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour).getTime()

function counts(partial: Partial<CountMap> = {}): CountMap {
  return { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, ...partial }
}

function review(over: Partial<StoredReview> = {}): StoredReview {
  return { depth: 12, reviewedAt: NOW, positions: [], whiteAccuracy: 80, blackAccuracy: 60, whiteAcpl: 20, blackAcpl: 40, whiteCounts: counts(), blackCounts: counts(), mistakes: [], ...over }
}

function game(id: string, over: Partial<SavedGame> = {}): SavedGame {
  return { id, createdAt: NOW, updatedAt: NOW, title: `Game ${id}`, white: 'Hana', black: 'Rani', result: '1-0', event: '', date: '', plies: 40, pgn: '1. e4 *', ...over }
}

const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

function item(id: string, theme: TrainingItem['theme'] = 'mate1', level: TrainingItem['level'] = 1): TrainingItem {
  return { id, kind: id.startsWith(MISTAKE_ID_PREFIX) ? 'mistake' : 'puzzle', theme, fen: FEN, solution: ['g1f3'], title: id, level }
}

function progressOf(items: Record<string, Partial<Attempt>>, days: Record<string, number> = {}): TrainingProgress {
  const filled: Record<string, Attempt> = {}
  for (const [id, value] of Object.entries(items)) filled[id] = { tries: 1, failures: 0, solved: false, clean: false, lastAt: NOW - 3_600_000, ...value }
  return { version: 1, items: filled, days }
}

describe('activitySummary', () => {
  it('lists the last seven days oldest first and ends on today', () => {
    const summary = activitySummary(emptyProgress(), [], NOW)
    expect(summary.days).toHaveLength(7)
    expect(summary.days.map((day) => day.key)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'])
    expect(summary.days[0].weekday).toBe('Wed')
    expect(summary.today.isToday).toBe(true)
    expect(summary.days.filter((day) => day.isToday)).toHaveLength(1)
    expect(summary.hasActivity).toBe(false)
    expect(summary.peak).toBe(1)
  })

  it('combines solved exercises, saved games and finished reviews from real data', () => {
    const progress = progressOf({}, { '2026-11-16': 3, '2026-11-17': 2, '2026-10-01': 9 })
    const games = [game('a', { createdAt: at(11, 16), review: review({ reviewedAt: at(11, 17) }) })]
    const summary = activitySummary(progress, games, NOW)
    expect(summary.days[5]).toMatchObject({ solved: 3, saved: 1, reviewed: 0, total: 4 })
    expect(summary.days[6]).toMatchObject({ solved: 2, saved: 0, reviewed: 1, total: 3 })
    expect(summary.totals).toEqual({ solved: 5, saved: 1, reviewed: 1 })
    expect(summary.activeDays).toBe(2)
    expect(summary.peak).toBe(4)
    expect(summary.hasActivity).toBe(true)
  })

  it('crosses a month boundary correctly', () => {
    const summary = activitySummary(emptyProgress(), [], new Date(2026, 11, 2, 9).getTime())
    expect(summary.days.map((day) => day.key)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
  })

  it('ignores games without usable timestamps', () => {
    const summary = activitySummary(emptyProgress(), [game('x', { createdAt: 0, review: review({ reviewedAt: 0 }) })], NOW)
    expect(summary.hasActivity).toBe(false)
  })
})

describe('recentGames', () => {
  it('returns the newest games first and respects the limit', () => {
    const games = [game('old', { updatedAt: 1 }), game('new', { updatedAt: 3 }), game('mid', { updatedAt: 2 })]
    expect(recentGames(games, 'Hana', 2).map((entry) => entry.id)).toEqual(['new', 'mid'])
    expect(recentGames(games, 'Hana', 0)).toEqual([])
  })

  it('reports your own accuracy and result when your name matches a side', () => {
    const win = recentGames([game('a', { review: review() })], 'Hana')[0]
    expect(win).toMatchObject({ side: 'w', outcome: 'win', reviewed: true })
    expect(win.accuracy).toEqual({ white: 80, black: 60, yours: 80 })

    const loss = recentGames([game('b', { review: review() })], 'Rani')[0]
    expect(loss).toMatchObject({ side: 'b', outcome: 'loss' })
    expect(loss.accuracy.yours).toBe(60)

    const draw = recentGames([game('c', { result: '1/2-1/2' })], 'Hana')[0]
    expect(draw.outcome).toBe('draw')
  })

  it('does not guess a side or accuracy when the name matches nobody', () => {
    const entry = recentGames([game('a', { review: review() })], 'Zed')[0]
    expect(entry.side).toBeNull()
    expect(entry.outcome).toBeNull()
    expect(entry.accuracy.yours).toBeNull()
    expect(entry.accuracy.white).toBe(80)
  })

  it('marks unreviewed and unfinished games', () => {
    const entry = recentGames([game('a', { result: '*' })], 'Hana')[0]
    expect(entry.reviewed).toBe(false)
    expect(entry.outcome).toBeNull()
    expect(entry.accuracy).toEqual({ white: null, black: null, yours: null })
  })
})

describe('moveQuality', () => {
  it('groups the classification counts', () => {
    const quality = moveQuality(counts({ best: 5, great: 1, good: 3, inaccuracy: 2, blunder: 1, mistake: 1 }))
    expect(quality.total).toBe(13)
    expect(quality.groups.map((group) => [group.key, group.count])).toEqual([['top', 6], ['solid', 3], ['slip', 2], ['error', 2]])
    expect(quality.groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1)
  })

  it('is empty without reviewed moves', () => {
    const quality = moveQuality(counts())
    expect(quality.total).toBe(0)
    expect(quality.groups.every((group) => group.share === 0)).toBe(true)
  })
})

describe('continueLearning', () => {
  const items = [item('a', 'mate1', 1), item('b', 'mate2', 2)]
  const base = { items, progress: emptyProgress(), games: [] as SavedGame[], hasPendingGame: false, now: NOW }

  it('offers the first exercise when nothing has been attempted', () => {
    const entries = continueLearning(base)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id: 'next-training', cta: 'Start training', to: '/training?item=a' })
    expect(entries[0].title).toContain('First exercise')
  })

  it('resumes the last attempted exercise while it is unsolved', () => {
    const progress = progressOf({ a: { solved: true, clean: true, lastAt: NOW - 86_400_000 * 3 }, b: { failures: 2, tries: 2, lastAt: NOW - 600_000 } })
    const entry = continueLearning({ ...base, progress })[0]
    expect(entry).toMatchObject({ id: 'resume-training', cta: 'Resume training', to: '/training?item=b' })
    expect(entry.detail).toContain('today')
    expect(entry.detail).toContain('2 wrong moves')
  })

  it('moves on to the next exercise when the last one was solved', () => {
    const progress = progressOf({ a: { solved: true, clean: true } })
    const entry = continueLearning({ ...base, progress })[0]
    expect(entry).toMatchObject({ id: 'next-training', cta: 'Continue training', to: '/training?item=b' })
    expect(entry.title).toContain('Next exercise')
  })

  it('revisits an exercise once everything is solved', () => {
    const progress = progressOf({ a: { solved: true, failures: 3 }, b: { solved: true } })
    const entry = continueLearning({ ...base, progress })[0]
    expect(entry.id).toBe('next-training')
    expect(entry.title).toContain('Revisit')
    expect(entry.to).toBe('/training?item=a')
  })

  it('ignores attempts on exercises that no longer exist', () => {
    const entry = continueLearning({ ...base, progress: progressOf({ ghost: { failures: 1 } }) })[0]
    expect(entry.id).toBe('next-training')
  })

  it('lists a waiting game first and never invents one', () => {
    expect(continueLearning({ ...base, hasPendingGame: true })[0]).toMatchObject({ id: 'pending-review', to: '/review' })
    expect(continueLearning(base).some((entry) => entry.id === 'pending-review')).toBe(false)
  })

  it('links the most recently updated game, noting whether it was reviewed', () => {
    const games = [game('old', { updatedAt: 1 }), game('fresh', { updatedAt: 5, review: review() })]
    const latest = continueLearning({ ...base, games }).find((entry) => entry.id === 'latest-game')
    expect(latest).toMatchObject({ title: 'Open your latest game', cta: 'Open review', game: { id: 'fresh', target: 'review' } })
    expect(latest?.detail).toContain('review saved')

    const plain = continueLearning({ ...base, games: [game('x')] }).find((entry) => entry.id === 'latest-game')
    expect(plain).toMatchObject({ title: 'Review your latest game', cta: 'Start review' })
    expect(plain?.detail).toContain('not reviewed yet')
  })

  it('returns nothing when there is no training item and no game', () => {
    expect(continueLearning({ ...base, items: [] })).toEqual([])
  })
})

describe('recommendations', () => {
  const items = [item('a', 'mate1'), item('a2', 'mate1'), item('b', 'mate2')]
  const base = { items, progress: emptyProgress(), games: [] as SavedGame[], hasPlayerName: false }

  it('starts with a first review for an empty library and fills up with real destinations', () => {
    const list = recommendations(base)
    expect(list.map((entry) => entry.id)).toEqual(['first-game', 'weakest-theme', 'openings'])
    expect(list[0].to).toBe('/review')
  })

  it('points at the least-practised puzzle theme', () => {
    const progress = progressOf({ a: { solved: true } })
    const weakest = recommendations({ ...base, progress }).find((entry) => entry.id === 'weakest-theme')
    expect(weakest?.title).toContain('Skakmat 2 langkah')
    expect(weakest?.to).toBe('/training?item=b')
  })

  it('flags unreviewed games and a missing player name', () => {
    const list = recommendations({ ...base, games: [game('a'), game('b', { review: review() }), game('c')] })
    const ids = list.map((entry) => entry.id)
    expect(ids).toContain('unreviewed')
    expect(ids).toContain('set-name')
    expect(ids).not.toContain('first-game')
    expect(list.find((entry) => entry.id === 'unreviewed')?.detail).toBe('2 saved games have no review yet.')
    expect(recommendations({ ...base, games: [game('a')], hasPlayerName: true }).map((entry) => entry.id)).not.toContain('set-name')
  })

  it('suggests training on unsolved mistakes only while some are unsolved', () => {
    const withMistakes = { ...base, items: [...items, item('m-g1-3', 'mistake', 2)], games: [game('g1', { review: review() })], hasPlayerName: true }
    const pending = recommendations(withMistakes).find((entry) => entry.id === 'mistakes')
    expect(pending?.to).toBe('/training?item=m-g1-3')
    expect(pending?.detail).toBe('1 position from your reviewed games is waiting.')
    const solved = recommendations({ ...withMistakes, progress: progressOf({ 'm-g1-3': { solved: true } }) })
    expect(solved.map((entry) => entry.id)).not.toContain('mistakes')
  })

  it('never returns more than four suggestions', () => {
    const many = { ...base, items: [...items, item('m-g1-3', 'mistake', 2)], games: [game('a'), game('g1')] }
    expect(recommendations(many).length).toBeLessThanOrEqual(4)
  })
})

describe('small helpers', () => {
  it('chooses the greeting by hour', () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(greetingFor)).toEqual(['Good night', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'])
  })

  it('describes days relative to now', () => {
    expect(relativeDay(NOW - 1000, NOW)).toBe('today')
    expect(relativeDay(at(11, 16), NOW)).toBe('yesterday')
    expect(relativeDay(at(11, 3), NOW)).toBe('Nov 3')
  })

  it('encodes training deep links', () => {
    expect(trainingLink('p001')).toBe('/training?item=p001')
    expect(trainingLink('m-g1 x-3')).toBe('/training?item=m-g1%20x-3')
  })
})

describe('trainingPool', () => {
  const mistakeGame = game('g1', {
    review: review({
      mistakes: [{ ply: 3, color: 'w', san: 'Qh5', fen: FEN, best: 'g1f3', bestSan: 'Nf3', classification: 'blunder', winLoss: 18 }],
    }),
  })

  it('contains every valid bundled puzzle plus your own mistakes', () => {
    const pool = trainingPool([mistakeGame], 'Hana')
    expect(pool.puzzles).toHaveLength(PUZZLES.filter(isValidItem).length)
    expect(pool.mistakes.map((entry) => entry.id)).toEqual(['m-g1-3'])
    expect(pool.all).toHaveLength(pool.puzzles.length + 1)
    expect(pool.all.every(isValidItem)).toBe(true)
  })

  it("leaves out the opponent's mistakes when your side is known", () => {
    expect(trainingPool([mistakeGame], 'Rani').mistakes).toEqual([])
  })

  it('is just the puzzles for an empty library', () => {
    expect(trainingPool([], 'Hana').mistakes).toEqual([])
  })
})
