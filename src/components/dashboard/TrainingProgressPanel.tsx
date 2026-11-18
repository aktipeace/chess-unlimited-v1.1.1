import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { SectionHeading } from '../ui/SectionHeading'
import { ProgressBar } from '../ui/ProgressBar'
import { THEME_LABELS, type TrainingSummary, type TrainingTheme } from '../../features/training/trainingModel'

const THEME_ORDER: TrainingTheme[] = ['mate1', 'mate2', 'mate3', 'material', 'mistake']

type TrainingProgressPanelProps = {
  summary: TrainingSummary
  /** True once the player has attempted at least one exercise. */
  hasHistory: boolean
}

export function TrainingProgressPanel({ summary, hasHistory }: TrainingProgressPanelProps) {
  const cleanRate = summary.cleanRate === null ? null : Math.round(summary.cleanRate * 100)
  return (
    <Panel className="db-panel db-training" aria-labelledby="db-training-title">
      <SectionHeading eyebrow="EXERCISES SOLVED BY THEME" title="Training progress" id="db-training-title" />
      {!hasHistory ? <p className="db-muted">No exercises attempted yet. Your progress fills in as you solve them.</p> : null}
      <ul className="db-theme-list">
        {THEME_ORDER.filter((theme) => summary.byTheme[theme].total > 0).map((theme) => {
          const { solved, total } = summary.byTheme[theme]
          return (
            <li key={theme}>
              <span>{THEME_LABELS[theme]}</span>
              <ProgressBar label={THEME_LABELS[theme]} value={solved} max={total} valueText={`${solved} of ${total} solved`} />
              <b>{solved}/{total}</b>
            </li>
          )
        })}
      </ul>
      <p className="db-muted">
        {summary.solved} of {summary.total} solved{cleanRate === null ? '' : ` · ${cleanRate}% without hints or wrong moves`}
      </p>
      <Link to="/training" className="db-link">Open Training Center <ArrowRight size={14} /></Link>
    </Panel>
  )
}
