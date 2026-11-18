import type { ReactNode } from 'react'
import { Panel } from './Panel'

type StatCardProps = {
  icon: ReactNode
  label: string
  /** The headline value, or "—" when there is nothing to show yet. */
  value: string
  /** Small unit or context printed next to the value ("%", "/ 12 saved", "days"). */
  unit?: string
  note?: string
}

/** One headline number with a label and a one-line explanation. */
export function StatCard({ icon, label, value, unit, note }: StatCardProps) {
  return (
    <Panel className="ui-stat">
      <div className="ui-stat-head"><span className="ui-stat-icon" aria-hidden="true">{icon}</span><span className="ui-stat-label">{label}</span></div>
      <div className="ui-stat-value">{value}{unit ? <small>{unit}</small> : null}</div>
      {note ? <p className="ui-stat-note">{note}</p> : null}
    </Panel>
  )
}
