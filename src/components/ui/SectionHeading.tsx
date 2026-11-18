import type { ReactNode } from 'react'

export function SectionHeading({ eyebrow, title, action, id }: { eyebrow?: string; title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="section-heading">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 id={id}>{title}</h2></div>
      {action}
    </div>
  )
}
