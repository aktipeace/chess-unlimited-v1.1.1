import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, BookMarked, BookOpen, Bot, ChartNoAxesCombined, GraduationCap } from 'lucide-react'
import { SectionHeading } from '../ui/SectionHeading'

const items = [
  { to: '/analysis', title: 'Analysis Studio', desc: 'Deep-dive into any position.', icon: Activity },
  { to: '/review', title: 'Game Review', desc: 'Find your turning points.', icon: ChartNoAxesCombined },
  { to: '/library', title: 'Game Library', desc: 'Your saved games and reviews.', icon: BookMarked },
  { to: '/openings', title: 'Opening Explorer', desc: 'Explore lines and ideas.', icon: BookOpen },
  { to: '/play', title: 'Play vs Bot', desc: 'Practise against the engine.', icon: Bot },
  { to: '/training', title: 'Training Center', desc: 'Sharpen your chess instincts.', icon: GraduationCap },
] as const

type QuickAccessProps = { gameCount: number; solved: number; exercises: number }

export function QuickAccess({ gameCount, solved, exercises }: QuickAccessProps) {
  // Badges only show numbers the app really has.
  const badges: Record<string, string> = {
    '/library': `${gameCount} ${gameCount === 1 ? 'game' : 'games'}`,
    '/training': `${solved}/${exercises} solved`,
  }
  return (
    <section className="db-section" aria-labelledby="db-quick-title">
      <SectionHeading eyebrow="YOUR TOOLKIT" title="Quick access" id="db-quick-title" />
      <nav aria-label="Quick access">
        <ul className="db-quick-grid">
          {items.map(({ to, title, desc, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="db-quick">
                <span className="db-quick-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="db-quick-copy"><strong>{title}</strong><span>{desc}</span>{badges[to] ? <span className="db-badge">{badges[to]}</span> : null}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
