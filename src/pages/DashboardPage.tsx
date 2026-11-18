import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityPanel } from '../components/dashboard/ActivityPanel'
import { ContinueLearning } from '../components/dashboard/ContinueLearning'
import { LiveClock } from '../components/dashboard/LiveClock'
import { PlayerStats } from '../components/dashboard/PlayerStats'
import { QuickAccess } from '../components/dashboard/QuickAccess'
import { RecentGames } from '../components/dashboard/RecentGames'
import { RecommendedActivities } from '../components/dashboard/RecommendedActivities'
import { TrainingProgressPanel } from '../components/dashboard/TrainingProgressPanel'
import { WelcomeSection } from '../components/dashboard/WelcomeSection'
import { activitySummary, continueLearning, greetingFor, recentGames, recommendations } from '../features/dashboard/dashboardModel'
import { libraryStats } from '../features/library/libraryModel'
import { useLibrary } from '../features/library/libraryStore'
import { openSavedGame } from '../features/library/openGame'
import { peekPendingGame } from '../features/review/pendingGame'
import { DEFAULT_SETTINGS } from '../features/settings/settingsModel'
import { useSettings } from '../features/settings/settingsStore'
import { trainingPool } from '../features/training/trainingItems'
import { dayKey, summarize } from '../features/training/trainingModel'
import { useTrainingProgress } from '../features/training/trainingStore'
import { useIsMobile } from '../lib/useIsMobile'
import { useNow } from '../lib/useNow'

/** Rows of "Recent games" per breakpoint: fewer on phones so the page stays short. */
const RECENT_DESKTOP = 5
const RECENT_MOBILE = 3

type Section = 'continue' | 'recent'

export function DashboardPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const library = useLibrary()
  const progress = useTrainingProgress()
  const now = useNow()
  // Day-based summaries depend on `today` rather than `now`, so they do not recompute every minute
  // but still roll over at midnight.
  const today = dayKey(now)
  const [notice, setNotice] = useState<{ source: Section; text: string } | null>(null)

  const hasPlayerName = settings.playerName !== DEFAULT_SETTINGS.playerName
  const games = library.games

  const stats = useMemo(() => libraryStats(games, settings.playerName), [games, settings.playerName])
  const pool = useMemo(() => trainingPool(games, settings.playerName), [games, settings.playerName])
  const training = useMemo(() => summarize(pool.all, progress, now), [pool.all, progress, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const activity = useMemo(() => activitySummary(progress, games, now), [progress, games, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentGames(games, settings.playerName, isMobile ? RECENT_MOBILE : RECENT_DESKTOP), [games, settings.playerName, isMobile])
  const hasPending = peekPendingGame() !== null
  const entries = useMemo(
    () => continueLearning({ items: pool.all, progress, games, hasPendingGame: hasPending, now }),
    [pool.all, progress, games, hasPending, today], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const suggestions = useMemo(() => recommendations({ items: pool.all, progress, games, hasPlayerName }), [pool.all, progress, games, hasPlayerName])

  const hasHistory = Object.keys(progress.items).length > 0

  const open = useCallback(
    (source: Section, gameId: string, target: 'review' | 'analysis') => {
      const game = games.find((item) => item.id === gameId)
      if (!game || !openSavedGame(game, target)) {
        setNotice({ source, text: 'This game could not be opened because its saved PGN is damaged.' })
        return
      }
      setNotice(null)
      navigate(target === 'review' ? '/review' : '/analysis')
    },
    [games, navigate],
  )

  const exercises = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`
  const summary =
    training.streak > 0
      ? `You are on a ${training.streak}-day training streak${training.today ? ` with ${exercises(training.today)} solved today` : ''}.`
      : training.today > 0
        ? `${exercises(training.today)} solved today.`
        : games.length || hasHistory
          ? 'Your board is ready. Pick up where you left off below.'
          : 'Your board is ready. Start with an exercise or review your first game.'

  return (
    <div className="page dashboard-page db-page">
      <WelcomeSection greeting={greetingFor(new Date(now).getHours())} name={hasPlayerName ? settings.playerName : null} summary={summary} clock={<LiveClock />} />

      <div className="db-row">
        <ContinueLearning entries={entries} onOpenGame={(id, target) => open('continue', id, target)} notice={notice?.source === 'continue' ? notice.text : null} />
        <ActivityPanel summary={activity} streak={training.streak} />
      </div>

      <PlayerStats stats={stats} training={training} playerName={settings.playerName} hasPlayerName={hasPlayerName} />

      <div className="db-row">
        <RecentGames games={recent} totalSaved={games.length} onOpen={(id, target) => open('recent', id, target)} notice={notice?.source === 'recent' ? notice.text : null} />
        <TrainingProgressPanel summary={training} hasHistory={hasHistory} />
      </div>

      <RecommendedActivities items={suggestions} />
      <QuickAccess gameCount={games.length} solved={training.solved} exercises={training.total} />
    </div>
  )
}
