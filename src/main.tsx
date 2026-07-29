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

      const checkForUpdate = async () => {
        if (updateInFlight || document.visibilityState === 'hidden') return
        updateInFlight = true
        try {
          await registration.update()
        } catch (error) {
          console.error('[PWA] service worker update check failed', error)
        } finally {
          updateInFlight = false
        }
      }

      void checkForUpdate()
      window.addEventListener('focus', () => { void checkForUpdate() })
      window.setInterval(() => { void checkForUpdate() }, 5 * 60 * 1000)
    }).catch(error => console.error('[PWA] service worker registration failed', error))
  })
}
