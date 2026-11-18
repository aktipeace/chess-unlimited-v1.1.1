import { useSettings } from '../../features/settings/settingsStore'

export function Topbar() {
  const { playerName } = useSettings()
  const initial = Array.from(playerName.trim())[0]?.toUpperCase() ?? '♞'
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>CHESS UNLIMITED</span><b>/</b><strong>WORKSPACE</strong></div>
      <div className="topbar-actions">
        <div className="avatar" role="img" aria-label={`Player: ${playerName}`}>{initial}</div>
      </div>
    </header>
  )
}
