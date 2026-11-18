import { Flame, Gauge, Target, Trophy } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { SectionHeading } from '../ui/SectionHeading'
import { StatCard } from '../ui/StatCard'
import { ProgressBar } from '../ui/ProgressBar'
import { moveQuality } from '../../features/dashboard/dashboardModel'
import type { LibraryStats } from '../../features/library/libraryModel'
import type { TrainingSummary } from '../../features/training/trainingModel'

type PlayerStatsProps = {
  stats: LibraryStats
  training: TrainingSummary
  playerName: string
  hasPlayerName: boolean
}

export function PlayerStats({ stats, training, playerName, hasPlayerName }: PlayerStatsProps) {
  const { wins, draws, losses } = stats.record
  const finished = wins + draws + losses
  const quality = moveQuality(stats.counts)
  const cleanRate = training.cleanRate === null ? null : Math.round(training.cleanRate * 100)

  return (
    <section className="db-section" aria-labelledby="db-stats-title">
      <SectionHeading eyebrow="FROM YOUR LIBRARY AND TRAINING" title="Player statistics" id="db-stats-title" />
      <div className="db-stat-grid">
        <StatCard
          icon={<Target size={17} />}
          label="Games reviewed"
          value={String(stats.reviewed)}
          unit={`/ ${stats.total} saved`}
          note={stats.total ? (stats.reviewed ? 'Reviews are stored in your Library.' : 'Run a Game Review to see your accuracy.') : 'Save a game to start your Library.'}
        />
        <StatCard
          icon={<Gauge size={17} />}
          label="Average accuracy"
          value={stats.averageAccuracy === null ? '—' : stats.averageAccuracy.toFixed(1)}
          unit={stats.averageAccuracy === null ? undefined : '%'}
          note={stats.accuracyScope === 'player' ? `Your side as ${playerName}.` : stats.accuracyScope === 'all' ? 'Both players. Set your name in Settings for your side only.' : 'Appears after your first review.'}
        />
        <StatCard
          icon={<Trophy size={17} />}
          label="Record (W-D-L)"
          value={finished ? `${wins}-${draws}-${losses}` : '—'}
          note={finished ? `${finished} finished ${finished === 1 ? 'game' : 'games'} as ${playerName}.` : hasPlayerName ? 'No saved game matches your name yet.' : 'Set your name in Settings to track your record.'}
        />
        <StatCard
          icon={<Flame size={17} />}
          label="Exercises solved"
          value={String(training.solved)}
          unit={`/ ${training.total}`}
          note={`${training.streak}-day streak${cleanRate === null ? '' : ` · ${cleanRate}% solved cleanly`}`}
        />
      </div>

      <Panel className="db-panel db-quality" aria-labelledby="db-quality-title">
        <h3 id="db-quality-title" className="db-subtitle">Move quality</h3>
        {quality.total > 0 ? (
          <ul className="db-quality-list">
            {quality.groups.map((group) => (
              <li key={group.key}>
                <span>{group.label}</span>
                <ProgressBar label={group.label} value={group.count} max={quality.total} valueText={`${group.count} of ${quality.total} moves`} />
                <b>{group.count}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="db-muted">Move quality appears after your first game review.</p>
        )}
      </Panel>
    </section>
  )
}
