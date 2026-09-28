import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { markUpdateAvailable } from './lib/pwaUpdate'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const start = () => {
    registerServiceWorker({ onUpdateReady: markUpdateAvailable }).catch((err) => {
      console.error('Service worker registration failed', err)
    })
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
