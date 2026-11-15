import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { markUpdateAvailable } from './lib/pwaUpdate'
import { reportError, installGlobalErrorReporting } from './lib/reportError'
import { connectSaveQueuesToSession } from './features/object/save/saveQueue'

/** Everything the app needs once its config is known to be present (main.jsx checks first). */
export function start() {
  installGlobalErrorReporting()
  // Sign-out deletes unsent object edits; another user signing in deletes the previous user's.
  connectSaveQueuesToSession()

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const registerWorker = () => {
      registerServiceWorker({ onUpdateReady: markUpdateAvailable }).catch((err) => {
        console.error('Service worker registration failed', err)
      })
    }
    if (document.readyState === 'complete') registerWorker()
    else window.addEventListener('load', registerWorker, { once: true })
  }

  createRoot(document.getElementById('root'), {
    // Errors caught by an ErrorBoundary are reported by the boundary itself (it shows whether
    // the report went out), so they aren't reported here too.

    // Errors no boundary caught.
    onUncaughtError: (error) => {
      reportError(error)
      console.error(error)
    },
  }).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
