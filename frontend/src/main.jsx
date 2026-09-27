import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

if (typeof registerSW === 'function') {
  const registerPwa = () => registerSW({ immediate: true })
  if (document.readyState === 'complete') {
    registerPwa()
  } else {
    window.addEventListener('load', registerPwa, { once: true })
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
