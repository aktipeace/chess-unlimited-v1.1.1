import { useEffect } from 'react'
import { useSettings } from '../../features/settings/settingsStore'

/** Applies display settings that are pure CSS (coordinates on/off) to the document root. */
export function SettingsEffects() {
  const settings = useSettings()
  useEffect(() => {
    document.documentElement.dataset.coords = settings.showCoordinates ? 'on' : 'off'
  }, [settings.showCoordinates])
  return null
}
