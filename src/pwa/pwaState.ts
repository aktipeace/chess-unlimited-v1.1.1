import { useSyncExternalStore } from 'react'

/**
 * Observable PWA state: service-worker registration, "update ready" and the browser's install prompt.
 * Kept outside React so main.tsx can register the worker before the UI mounts.
 */
export type PwaState = {
  supported: boolean
  /** The service worker is active, so the app shell works offline. */
  offlineReady: boolean
  /** A newer version has been downloaded and waits for a reload. */
  updateReady: boolean
  /** The browser offered an install prompt we can trigger. */
  canInstall: boolean
  /** Running as an installed app (standalone window). */
  installed: boolean
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let state: PwaState = { supported: false, offlineReady: false, updateReady: false, canInstall: false, installed: false }
let deferredPrompt: InstallPromptEvent | null = null
let waitingWorker: ServiceWorker | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export const getPwaState = () => state
export const subscribePwa = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const usePwaState = () => useSyncExternalStore(subscribePwa, getPwaState, getPwaState)

function isStandalone() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone)
}

function trackInstalling(worker: ServiceWorker | null) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state !== 'installed') return
    if (navigator.serviceWorker.controller) {
      waitingWorker = worker
      set({ updateReady: true })
    } else {
      set({ offlineReady: true })
    }
  })
}

/** Registers the service worker (production only) and wires the install prompt. Safe to call once. */
export function initPwa() {
  if (typeof window === 'undefined') return
  set({ installed: isStandalone() })

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    set({ canInstall: false, installed: true })
  })

  if (!('serviceWorker' in navigator)) return
  set({ supported: true })
  if (!import.meta.env.PROD) return // the dev server must never be cached

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.active) set({ offlineReady: true })
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting
          set({ updateReady: true })
        }
        registration.addEventListener('updatefound', () => trackInstalling(registration.installing))
        // Look for a new version whenever the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) void registration.update().catch(() => {})
        })
      })
      .catch(() => {
        // Registration can fail on http:// or in private windows; the app still works online.
      })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

/** Shows the browser's install dialog. Returns true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  set({ canInstall: false })
  await prompt.prompt()
  const choice = await prompt.userChoice
  return choice.outcome === 'accepted'
}

/** Activates the waiting worker; the page reloads itself on `controllerchange`. */
export function applyUpdate() {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
}
