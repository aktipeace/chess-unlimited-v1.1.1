import { CalendarDays } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { SectionHeading } from '../ui/SectionHeading'
import { EmptyState } from '../ui/EmptyState'
import type { ActivityDay, ActivitySummary } from '../../features/dashboard/dashboardModel'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Screen-reader description of one day, listing only what happened. */
export function describeDay(day: ActivityDay): string {
  const parts: string[] = []
  if (day.solved) parts.push(plural(day.solved, 'exercise solved', 'exercises solved'))
  if (day.saved) parts.push(plural(day.saved, 'game saved', 'games saved'))
  if (day.reviewed) parts.push(plural(day.reviewed, 'review finished', 'reviews finished'))
  return `${day.weekday} ${day.dayOfMonth}${day.isToday ? ' (today)' : ''}: ${parts.length ? parts.join(', ') : 'no activity'}`
}

type ActivityPanelProps = {
  summary: ActivitySummary
  streak: number
}

export function ActivityPanel({ summary, streak }: ActivityPanelProps) {
  const { days, totals, today, peak } = summary
  return (
    <Panel className="db-panel db-activity" aria-labelledby="db-activity-title">
      <SectionHeading eyebrow="LAST 7 DAYS" title="Daily activity" id="db-activity-title" />
      {summary.hasActivity ? (
        <>
          <p className="db-activity-summary">
            Today: <b>{plural(today.solved, 'exercise', 'exercises')}</b> solved{streak > 0 ? <> · <b>{streak}-day</b> training streak</> : null}
          </p>
          <ol className="db-bars" aria-label="Activity over the last 7 days">
            {days.map((day) => (
              <li key={day.key} className={day.isToday ? 'is-today' : undefined}>
                <span className="db-bar-area" aria-hidden="true">
                  <span className="db-bar-stack" style={{ height: `${(day.total / peak) * 100}%` }}>
                    {day.reviewed > 0 && <i className="seg-reviewed" style={{ flexGrow: day.reviewed }} />}
                    {day.saved > 0 && <i className="seg-saved" style={{ flexGrow: day.saved }} />}
                    {day.solved > 0 && <i className="seg-solved" style={{ flexGrow: day.solved }} />}
                  </span>
                </span>
                <span className="db-bar-label" aria-hidden="true">{day.weekday}</span>
                <span className="sr-only">{describeDay(day)}</span>
              </li>
            ))}
          </ol>
          <ul className="db-legend" aria-label="Legend">
            <li><i className="seg-solved" /> Exercises solved · {totals.solved}</li>
            <li><i className="seg-saved" /> Games saved · {totals.saved}</li>
            <li><i className="seg-reviewed" /> Reviews · {totals.reviewed}</li>
          </ul>
        </>
      ) : (
        <EmptyState icon={<CalendarDays size={20} />} title="No activity in the last 7 days">
          Solve an exercise, save a game or finish a review and it will show up here.
        </EmptyState>
      )}
    </Panel>
  )
}
