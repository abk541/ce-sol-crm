import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAppearance } from './lib/appearance'

initializeAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { updateViaCache: 'none' },
    ).then(registration => {
      let updateInFlight = false
      let promptedWorker: ServiceWorker | null = null
      let reloadApproved = false

      const offerSafeReload = (worker: ServiceWorker | null) => {
        if (
          !worker
          || !navigator.serviceWorker.controller
          || worker !== registration.waiting
          || promptedWorker === worker
        ) return

        promptedWorker = worker
        const accepted = window.confirm(
          'A new CE Solution Plus version is ready. Reload now to use it? '
          + 'Choose Cancel if you have unsaved work, then close and reopen the app when ready.',
        )
        if (!accepted) return
        reloadApproved = true
        worker.postMessage({ type: 'SKIP_WAITING' })
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadApproved) return
        window.location.reload()
      })

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing
        if (!installingWorker) return
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            offerSafeReload(installingWorker)
          }
        })
      })

      const checkForUpdate = async () => {
        if (updateInFlight || document.visibilityState === 'hidden') return
        updateInFlight = true
        try {
          await registration.update()
          offerSafeReload(registration.waiting)
        } catch (error) {
          console.error('[PWA] service worker update check failed', error)
        } finally {
          updateInFlight = false
        }
      }

      offerSafeReload(registration.waiting)
      void checkForUpdate()
      window.addEventListener('focus', () => { void checkForUpdate() })
      window.setInterval(() => { void checkForUpdate() }, 5 * 60 * 1000)
    }).catch(error => console.error('[PWA] service worker registration failed', error))
  })
}
