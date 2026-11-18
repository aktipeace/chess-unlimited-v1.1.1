import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Sidebar />
      <div className="main-column">
        <Topbar />
        <main className="main-content" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer">
          <span>CHESS UNLIMITED <span className="footer-dot">●</span> BUILD YOUR GAME</span>
          <span>Independent chess workspace</span>
        </footer>
      </div>
    </div>
  )
}
