import { Link } from 'react-router-dom'
import { ArrowRight, BookMarked, GraduationCap, Play } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { SectionHeading } from '../ui/SectionHeading'
import { EmptyState } from '../ui/EmptyState'
import type { ContinueEntry } from '../../features/dashboard/dashboardModel'

type ContinueLearningProps = {
  entries: ContinueEntry[]
  onOpenGame: (gameId: string, target: 'review') => void
  /** Error shown when a saved game could not be opened. */
  notice?: string | null
}

function iconFor(id: ContinueEntry['id']) {
  if (id === 'latest-game') return <BookMarked size={18} />
  if (id === 'pending-review') return <Play size={18} />
  return <GraduationCap size={18} />
}

export function ContinueLearning({ entries, onOpenGame, notice }: ContinueLearningProps) {
  return (
    <Panel className="db-panel db-continue" aria-labelledby="db-continue-title">
      <SectionHeading eyebrow="PICK UP WHERE YOU LEFT OFF" title="Continue learning" id="db-continue-title" />
      {notice ? <p className="db-alert" role="alert">{notice}</p> : null}
      {entries.length ? (
        <ul className="db-continue-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="db-continue-icon" aria-hidden="true">{iconFor(entry.id)}</span>
              <div className="db-continue-copy">
                <strong>{entry.title}</strong>
                <span>{entry.detail}</span>
              </div>
              {entry.to ? (
                <Link to={entry.to} className="db-button">{entry.cta} <ArrowRight size={14} /></Link>
              ) : entry.game ? (
                <button type="button" className="db-button" onClick={() => onOpenGame(entry.game!.id, entry.game!.target)}>{entry.cta} <ArrowRight size={14} /></button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<GraduationCap size={20} />} title="Nothing to continue yet" action={<Link to="/training" className="db-button">Open Training Center <ArrowRight size={14} /></Link>}>
          Start an exercise or review a game and your shortcuts will appear here.
        </EmptyState>
      )}
    </Panel>
  )
}
