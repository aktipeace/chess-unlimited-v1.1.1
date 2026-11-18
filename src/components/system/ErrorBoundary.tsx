import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = { children: ReactNode; /** Changing this value (e.g. the route) clears a previous error. */ resetKey?: string }
type State = { error: Error | null; resetKey?: string }

/**
 * Last line of defence: a crash in one page shows a calm recovery screen instead of a blank app,
 * and navigating elsewhere (resetKey changes) lets the person continue.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Chess Unlimited crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page error-page" role="alert">
        <div className="feature-empty">
          <div className="feature-empty-icon"><AlertTriangle size={25} /></div>
          <div className="eyebrow">TERJADI KESALAHAN</div>
          <h2>Halaman ini mengalami masalah.</h2>
          <p>Data di Library dan progres latihanmu tidak terpengaruh. Coba muat ulang halaman, atau kembali ke Overview.</p>
          <p className="error-detail">{this.state.error.message}</p>
          <div className="game-actions">
            <button className="analyze-button" onClick={() => window.location.reload()}>Muat ulang</button>
            <a className="mini-button text" href="/">Kembali ke Overview</a>
          </div>
        </div>
      </div>
    )
  }
}
