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

// Suppress linkifyjs "already initialized" warnings from Tiptap Link extension
const isLinkifyInitWarning = (msg) =>
  typeof msg === 'string' && msg.includes('linkifyjs: already initialized')
const patchConsole = (method) => {
  const orig = console[method]
  console[method] = (...args) => {
    if (isLinkifyInitWarning(args[0])) return
    orig.apply(console, args)
  }
}
patchConsole('warn')
patchConsole('log')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
