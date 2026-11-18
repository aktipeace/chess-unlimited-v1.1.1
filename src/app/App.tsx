import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ErrorBoundary } from '../components/system/ErrorBoundary'
import { SettingsEffects } from '../components/system/SettingsEffects'
import { DashboardPage } from '../pages/DashboardPage'
import { AnalysisPage } from '../pages/AnalysisPage'
import { ReviewPage } from '../pages/ReviewPage'
import { LibraryPage } from '../pages/LibraryPage'
import { OpeningsPage } from '../pages/OpeningsPage'
import { PlayPage } from '../pages/PlayPage'
import { TrainingPage } from '../pages/TrainingPage'
import { SettingsPage } from '../pages/SettingsPage'

export default function App() {
  const location = useLocation()
  return (
    <AppShell>
      <SettingsEffects />
      <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/openings" element={<OpeningsPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}
