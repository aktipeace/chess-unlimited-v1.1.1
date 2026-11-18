import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newGame } from '../features/analysis/gameModel'
import { makeSavedGame, type SavedGame, type StoredReview, type CountMap } from '../features/library/libraryModel'
import { libraryStore } from '../features/library/libraryStore'
import { clearPendingGame, peekPendingGame, peekPendingSavedId, setPendingGame } from '../features/review/pendingGame'
import { settingsStore, updateSettings } from '../features/settings/settingsStore'
import { markFailure, markSolved, trainingStore } from '../features/training/trainingStore'
import { DashboardPage } from './DashboardPage'

const PGN = (white: string, black: string, result: string) => `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n1. e4 e5 2. Nf3 Nc6 ${result}`

const zeroCounts = (): CountMap => ({ brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 })

function review(white: number, black: number): StoredReview {
  return { depth: 12, reviewedAt: Date.now(), positions: [], whiteAccuracy: white, blackAccuracy: black, whiteAcpl: 20, blackAcpl: 30, whiteCounts: { ...zeroCounts(), best: 3, blunder: 1 }, blackCounts: { ...zeroCounts(), good: 2 }, mistakes: [] }
}

function saved(id: string, white: string, black: string, result: string, updatedAt: number, withReview?: StoredReview): SavedGame {
  return { ...makeSavedGame({ id, pgn: PGN(white, black, result), plies: 4, now: updatedAt }), ...(withReview ? { review: withReview } : {}) }
}

function seedLibrary(games: SavedGame[]) {
  libraryStore.set({ version: 1, games })
}

function Probe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function stubViewport(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: mobile, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
  })
}

beforeEach(() => {
  libraryStore.reset()
  trainingStore.reset()
  settingsStore.reset()
  clearPendingGame()
  stubViewport(false)
})

afterEach(() => {
  clearPendingGame()
  libraryStore.reset()
  trainingStore.reset()
  settingsStore.reset()
})

describe('Dashboard: welcome', () => {
  it('greets by time of day without a name until one is set', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening|night)\.$/)
  })

  it('uses the player name from Settings', () => {
    updateSettings({ playerName: 'Hana' })
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening|night), Hana\.$/)
  })

  it('renders every required section', () => {
    renderDashboard()
    for (const name of ['Continue learning', 'Daily activity', 'Player statistics', 'Recent games', 'Training progress', 'Recommended activities', 'Quick access']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })
})

describe('Dashboard: empty library and no training history', () => {
  it('shows meaningful empty states instead of numbers it does not have', () => {
    renderDashboard()
    expect(screen.getByText('No saved games yet')).toBeInTheDocument()
    expect(screen.getByText('No activity in the last 7 days')).toBeInTheDocument()
    expect(screen.getByText('Save a game to start your Library.')).toBeInTheDocument()
    expect(screen.getByText('Move quality appears after your first game review.')).toBeInTheDocument()
    expect(screen.getByText('No exercises attempted yet. Your progress fills in as you solve them.')).toBeInTheDocument()
    expect(screen.getByText('Appears after your first review.')).toBeInTheDocument()
    expect(screen.getByText('Set your name in Settings to track your record.')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('still offers somewhere to go: first exercise and a first review', () => {
    renderDashboard()
    const start = screen.getByRole('link', { name: /Start training/ })
    expect(start.getAttribute('href')).toMatch(/^\/training\?item=/)
    expect(screen.getByText('Review your first game')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open review' })).not.toBeInTheDocument()
  })
})

describe('Dashboard: existing game history', () => {
  beforeEach(() => {
    updateSettings({ playerName: 'Hana' })
    seedLibrary([saved('g1', 'Hana', 'Rani', '1-0', 2000, review(91.2, 70.4)), saved('g2', 'Zed', 'Rani', '0-1', 1000)])
  })

  it('computes statistics from the saved games', () => {
    renderDashboard()
    expect(screen.getByText('/ 2 saved')).toBeInTheDocument()
    expect(screen.getByText('91.2')).toBeInTheDocument()
    expect(screen.getByText('Your side as Hana.')).toBeInTheDocument()
    expect(screen.getByText('1-0-0')).toBeInTheDocument()
    expect(screen.getByText('1 finished game as Hana.')).toBeInTheDocument()
  })

  it('lists recent games with your own accuracy, newest first', () => {
    renderDashboard()
    const list = screen.getAllByRole('button', { name: /in Game Review$/ })
    expect(list.map((button) => button.getAttribute('aria-label'))).toEqual(['Open Hana vs Rani in Game Review', 'Open Zed vs Rani in Game Review'])
    expect(within(list[0]).getByText('Win')).toBeInTheDocument()
    expect(within(list[0]).getByText(/Accuracy 91%/)).toBeInTheDocument()
    expect(within(list[1]).getByText(/Not reviewed/)).toBeInTheDocument()
    expect(within(list[1]).getByText('0-1')).toBeInTheDocument()
  })

  it('shows move quality from the reviewed games', () => {
    renderDashboard()
    expect(screen.queryByText('Move quality appears after your first game review.')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Top moves' })).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByRole('progressbar', { name: 'Mistakes & blunders' })).toHaveAttribute('aria-valuenow', '1')
  })

  it('recommends reviewing the saved game that has no review', () => {
    renderDashboard()
    expect(screen.getByText('Review a saved game')).toBeInTheDocument()
    expect(screen.getByText('1 saved game has no review yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Library \(2\)/ })).toHaveAttribute('href', '/library')
  })

  it('shows the library size on the quick access tile', () => {
    renderDashboard()
    const quick = screen.getByRole('navigation', { name: 'Quick access' })
    expect(within(quick).getAllByRole('link')).toHaveLength(6)
    expect(within(quick).getByRole('link', { name: /Play vs Bot/ })).toHaveAttribute('href', '/play')
    expect(within(quick).getByText('2 games')).toBeInTheDocument()
  })
})

describe('Dashboard: training progress', () => {
  it('reflects solved exercises in the streak, activity and progress bars', () => {
    markSolved('p001', false)
    renderDashboard()
    expect(screen.getByText('You are on a 1-day training streak with 1 exercise solved today.')).toBeInTheDocument()
    expect(screen.getByText(/Today:/)).toHaveTextContent('Today: 1 exercise solved · 1-day training streak')
    expect(screen.getByRole('progressbar', { name: 'Skakmat 1 langkah' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText(/^Next exercise:/)).toBeInTheDocument()
    expect(screen.queryByText('No activity in the last 7 days')).not.toBeInTheDocument()
    expect(screen.queryByText(/No exercises attempted yet/)).not.toBeInTheDocument()
  })

  it('gives the activity chart a text alternative for every day', () => {
    markSolved('p001', false)
    renderDashboard()
    const chart = screen.getByRole('list', { name: 'Activity over the last 7 days' })
    expect(within(chart).getAllByRole('listitem')).toHaveLength(7)
    expect(within(chart).getByText(/\(today\): 1 exercise solved/)).toBeInTheDocument()
    expect(within(chart).getAllByText(/: no activity$/)).toHaveLength(6)
  })

  it('counts exercises the same way as the Training Center', () => {
    renderDashboard()
    const total = Number(screen.getByRole('progressbar', { name: 'Skakmat 1 langkah' }).getAttribute('aria-valuemax'))
    expect(total).toBeGreaterThan(0)
    expect(screen.getByText(/^0 of \d+ solved$/)).toBeInTheDocument()
  })
})

describe('Dashboard: Continue learning', () => {
  it('resumes an unsolved exercise through a deep link to it', () => {
    markFailure('p002')
    renderDashboard()
    expect(screen.getByText(/^Resume:/)).toBeInTheDocument()
    expect(screen.getByText(/1 wrong move so far/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Resume training/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/training?item=p002')
  })

  it('opens the latest saved game in Game Review with its saved review', () => {
    seedLibrary([saved('g1', 'Hana', 'Rani', '1-0', 2000, review(80, 60))])
    renderDashboard()
    expect(screen.getByText('Open your latest game')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open review' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/review')
    expect(peekPendingGame()?.moves).toHaveLength(4)
    expect(peekPendingGame()?.cursor).toBe(0)
    expect(peekPendingSavedId()).toBe('g1')
  })

  it('opens a recent game in Analysis at the end of the line', () => {
    seedLibrary([saved('g1', 'Hana', 'Rani', '1-0', 2000)])
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Open Hana vs Rani in Analysis Studio' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/analysis')
    expect(peekPendingGame()?.cursor).toBe(4)
    expect(peekPendingSavedId()).toBeNull()
  })

  it('continues a game review only when a game is really waiting', () => {
    const { unmount } = renderDashboard()
    expect(screen.queryByRole('link', { name: /Continue review/ })).not.toBeInTheDocument()
    unmount()

    setPendingGame(newGame())
    renderDashboard()
    const link = screen.getByRole('link', { name: /Continue review/ })
    expect(link).toHaveAttribute('href', '/review')
    fireEvent.click(link)
    expect(screen.getByTestId('location')).toHaveTextContent('/review')
  })

  it('reports a damaged saved game instead of navigating', () => {
    const broken = { ...saved('bad', 'Hana', 'Rani', '1-0', 2000), pgn: 'this is not a pgn' }
    seedLibrary([broken])
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Open review' }))
    expect(screen.getByRole('alert')).toHaveTextContent('saved PGN is damaged')
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()
    expect(peekPendingGame()).toBeNull()
  })
})

describe('Dashboard: responsive behaviour', () => {
  const many = () => seedLibrary(Array.from({ length: 6 }, (_, index) => saved(`g${index}`, 'Hana', 'Rani', '1-0', 1000 + index)))

  it('lists five recent games on larger screens', () => {
    many()
    renderDashboard()
    expect(screen.getAllByRole('button', { name: /in Game Review$/ })).toHaveLength(5)
  })

  it('lists three recent games on phones', () => {
    stubViewport(true)
    many()
    renderDashboard()
    expect(screen.getAllByRole('button', { name: /in Game Review$/ })).toHaveLength(3)
  })
})
