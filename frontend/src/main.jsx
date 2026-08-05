import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCustomProtocol, init } from 'linkifyjs'
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

// Initialize linkify once with default schemes so BlockNote/Tiptap Link extension
// does not trigger "already initialized" warnings when multiple editors mount.
const LINK_PROTOCOLS = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp']
LINK_PROTOCOLS.forEach((scheme) => registerCustomProtocol(scheme))
init()

// Tiptap's Link extension re-registers linkify protocols on every editor
// mount, which linkifyjs reports via console.warn. Filter exactly that one
// message on console.warn only; everything else passes through untouched.
const origWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('linkifyjs: already initialized')) return
  origWarn.apply(console, args)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
