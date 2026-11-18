import { Activity, Bot, BookMarked, BookOpen, ChartNoAxesCombined, CircleHelp, Crown, GraduationCap, LayoutDashboard, Settings2, Swords } from 'lucide-react'
import { APP_VERSION } from '../../lib/version'
import { NavLink } from 'react-router-dom'

const mainLinks = [
  { to: '/', label: 'Overview', short: 'Overview', icon: LayoutDashboard, end: true, tag: undefined },
  { to: '/analysis', label: 'Analysis Studio', short: 'Analysis', icon: Activity, end: false, tag: undefined },
  { to: '/review', label: 'Game Review', short: 'Review', icon: ChartNoAxesCombined, end: false, tag: undefined },
  { to: '/library', label: 'Game Library', short: 'Library', icon: BookMarked, end: false, tag: undefined },
]
const learnLinks = [
  { to: '/openings', label: 'Opening Explorer', short: 'Openings', icon: BookOpen, tag: undefined },
  { to: '/play', label: 'Play vs Bot', short: 'Bot', icon: Bot, tag: undefined },
  { to: '/training', label: 'Training Center', short: 'Training', icon: GraduationCap, tag: undefined },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand">
        <span className="brand-mark"><Crown size={19} strokeWidth={2.2} /></span>
        <span className="brand-copy"><strong>CHESS<span>UNLIMITED</span></strong><small>YOUR CHESS WORKSPACE</small></span>
      </NavLink>

      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-group" aria-label="Workspace">
        {mainLinks.map(({ to, label, short, icon: Icon, end, tag }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon size={18} /><span>{label}</span><span className="nav-short">{short}</span>{tag && <small className="nav-tag">{tag}</small>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-label learn-label">IMPROVE</div>
      <nav className="nav-group" aria-label="Improve">
        {learnLinks.map(({ to, label, short, icon: Icon, tag }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon size={18} /><span>{label}</span><span className="nav-short">{short}</span>{tag && <small className="nav-tag">{tag}</small>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="upgrade-card">
          <div className="upgrade-icon"><Swords size={17} /></div>
          <strong>Your next move</strong>
          <p>A better chess routine starts with one position at a time.</p>
          <span className="upgrade-status"><i /> VERSION {APP_VERSION}</span>
        </div>
        <NavLink to="/settings" className={({ isActive }) => `nav-link settings-link${isActive ? ' active' : ''}`}><Settings2 size={18} /><span>Settings</span><span className="nav-short">Settings</span></NavLink>
        <a className="nav-link help-link" href="https://lichess.org/learn" target="_blank" rel="noreferrer"><CircleHelp size={18} /><span>Chess learning</span></a>
        <div className="sidebar-version">CHESS UNLIMITED <span>v{APP_VERSION}</span></div>
      </div>
    </aside>
  )
}
