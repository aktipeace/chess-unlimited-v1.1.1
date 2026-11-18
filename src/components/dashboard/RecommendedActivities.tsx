import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, BookMarked, BookOpen, Bot, ChartNoAxesCombined, GraduationCap, Settings2 } from 'lucide-react'
import { SectionHeading } from '../ui/SectionHeading'
import type { Recommendation, RecommendationIcon } from '../../features/dashboard/dashboardModel'

const ICONS: Record<RecommendationIcon, typeof Activity> = {
  review: ChartNoAxesCombined,
  library: BookMarked,
  training: GraduationCap,
  settings: Settings2,
  openings: BookOpen,
  play: Bot,
  analysis: Activity,
}

export function RecommendedActivities({ items }: { items: Recommendation[] }) {
  return (
    <section className="db-section" aria-labelledby="db-recommended-title">
      <SectionHeading eyebrow="BASED ON YOUR LIBRARY AND TRAINING" title="Recommended activities" id="db-recommended-title" />
      <ul className="db-reco-grid">
        {items.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <li key={item.id}>
              <Link to={item.to} className="db-reco">
                <span className="db-reco-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="db-reco-copy"><strong>{item.title}</strong><span>{item.detail}</span></span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
