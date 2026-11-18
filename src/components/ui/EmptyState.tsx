import type { ReactNode } from 'react'

type EmptyStateProps = { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }

/** Friendly placeholder for a section that has no data yet: what is missing, why, and what to do. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      {icon ? <span className="ui-empty-icon" aria-hidden="true">{icon}</span> : null}
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  )
}
