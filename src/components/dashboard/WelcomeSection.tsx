import type { ReactNode } from 'react'
import { ArrowRight, Crown } from 'lucide-react'
import { Link } from 'react-router-dom'

type WelcomeSectionProps = {
  greeting: string
  /** Shown after the greeting; null while the player has not set a name. */
  name: string | null
  /** One honest sentence about where the player stands today. */
  summary: string
  clock?: ReactNode
}

export function WelcomeSection({ greeting, name, summary, clock }: WelcomeSectionProps) {
  return (
    <section className="db-hero" aria-label="Welcome to Chess Unlimited">
      <div className="db-hero-grid" aria-hidden="true" />
      <div className="db-hero-copy">
        <div className="welcome-kicker"><Crown size={14} strokeWidth={2.2} /> YOUR CHESS WORKSPACE</div>
        <h1>{greeting}<em>{name ? `, ${name}` : ''}.</em></h1>
        <p>{summary}</p>
        <Link to="/training" className="db-hero-cta">Continue improving <ArrowRight size={16} /></Link>
      </div>
      <div className="db-hero-aside">
        <div className="db-hero-piece" aria-hidden="true">♞</div>
        {clock}
      </div>
    </section>
  )
}
