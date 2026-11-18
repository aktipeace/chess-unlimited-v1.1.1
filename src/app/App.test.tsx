import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

vi.stubGlobal('Worker', MockWorker)

describe('application foundation', () => {
  it('renders the Chess Unlimited workspace', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening|night)/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Continue learning' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
  })

  it('renders the analysis module route', () => {
    render(<MemoryRouter initialEntries={['/analysis']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Analysis Studio', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Chess board' })).toBeInTheDocument()
    expect(screen.getByText(/ENGINE CONTROL/i)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Move navigation' })).toBeInTheDocument()
    expect(screen.getByText(/Belum ada langkah/i)).toBeInTheDocument()
    expect(screen.getByLabelText('CURRENT FEN')).toHaveValue('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  })

  it('renders the game review module route', () => {
    render(<MemoryRouter initialEntries={['/review']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Game Review', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Review board' })).toBeInTheDocument()
    expect(screen.getByLabelText('PGN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start review/i })).toBeDisabled()
    expect(screen.getByText(/Belum ada permainan/i)).toBeInTheDocument()
  })

  it('renders the library, with an empty state before anything is saved', () => {
    render(<MemoryRouter initialEntries={['/library']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Game Library', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Belum ada permainan tersimpan/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Cari permainan')).toBeInTheDocument()
  })

  it('renders the opening explorer with the book moves from the start position', () => {
    render(<MemoryRouter initialEntries={['/openings']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Opening Explorer', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Opening board' })).toBeInTheDocument()
    expect(screen.getByText('LANGKAH DALAM BUKU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^e4/ })).toBeInTheDocument()
  })

  it('renders the training center with a puzzle to solve', () => {
    render(<MemoryRouter initialEntries={['/training']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Training Center', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Training board' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Petunjuk/i })).toBeInTheDocument()
  })

  it('renders settings', () => {
    render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('NAMA')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unduh cadangan/i })).toBeInTheDocument()
  })

  it('falls back to the dashboard for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening|night)/ })).toBeInTheDocument()
  })
})
