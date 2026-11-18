import { Link } from 'react-router-dom'
import { ArrowRight, BookMarked } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { SectionHeading } from '../ui/SectionHeading'
import { EmptyState } from '../ui/EmptyState'
import type { RecentGame } from '../../features/dashboard/dashboardModel'

const OUTCOME_LABEL = { win: 'Win', draw: 'Draw', loss: 'Loss' } as const

function resultLabel(game: RecentGame): { text: string; tone: 'win' | 'draw' | 'loss' | 'neutral' } {
  if (game.outcome) return { text: OUTCOME_LABEL[game.outcome], tone: game.outcome }
  if (game.result === '1-0' || game.result === '0-1' || game.result === '1/2-1/2') return { text: game.result, tone: 'neutral' }
  return { text: 'No result', tone: 'neutral' }
}

function accuracyLabel(game: RecentGame): string {
  if (!game.reviewed) return 'Not reviewed'
  if (game.accuracy.yours !== null) return `Accuracy ${Math.round(game.accuracy.yours)}%`
  const parts: string[] = []
  if (game.accuracy.white !== null) parts.push(`White ${Math.round(game.accuracy.white)}%`)
  if (game.accuracy.black !== null) parts.push(`Black ${Math.round(game.accuracy.black)}%`)
  return parts.length ? parts.join(' · ') : 'Reviewed'
}

type RecentGamesProps = {
  games: RecentGame[]
  totalSaved: number
  onOpen: (gameId: string, target: 'review' | 'analysis') => void
  notice?: string | null
}

export function RecentGames({ games, totalSaved, onOpen, notice }: RecentGamesProps) {
  return (
    <Panel className="db-panel db-recent" aria-labelledby="db-recent-title">
      <SectionHeading eyebrow="LATEST ACTIVITY IN YOUR LIBRARY" title="Recent games" id="db-recent-title" />
      {notice ? <p className="db-alert" role="alert">{notice}</p> : null}
      {games.length ? (
        <ul className="db-game-list">
          {games.map((game) => {
            const result = resultLabel(game)
            return (
              <li key={game.id}>
                <button type="button" className="db-game-main" onClick={() => onOpen(game.id, 'review')} aria-label={`Open ${game.title} in Game Review`}>
                  <span className="db-game-title">{game.title}</span>
                  <span className="db-game-meta">{game.opening ?? `${game.plies} ply`} · {accuracyLabel(game)}</span>
                  <span className={`db-chip tone-${result.tone}`}>{result.text}</span>
                </button>
                <button type="button" className="db-game-aux" onClick={() => onOpen(game.id, 'analysis')} aria-label={`Open ${game.title} in Analysis Studio`}>Analysis</button>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={<BookMarked size={20} />} title="No saved games yet" action={<Link to="/review" className="db-button">Open Game Review <ArrowRight size={14} /></Link>}>
          Review a game or import a PGN and it will appear here.
        </EmptyState>
      )}
      {totalSaved > 0 ? <Link to="/library" className="db-link">Open Library ({totalSaved}) <ArrowRight size={14} /></Link> : null}
    </Panel>
  )
}
