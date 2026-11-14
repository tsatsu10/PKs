import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { markUpdateAvailable } from './lib/pwaUpdate'
import { reportError, installGlobalErrorReporting } from './lib/reportError'

installGlobalErrorReporting()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const start = () => {
    registerServiceWorker({ onUpdateReady: markUpdateAvailable }).catch((err) => {
      console.error('Service worker registration failed', err)
    })
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

createRoot(document.getElementById('root'), {
  // Errors caught by the per-route ErrorBoundary (it still logs them itself).
  onCaughtError: (error) => reportError(error),
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
