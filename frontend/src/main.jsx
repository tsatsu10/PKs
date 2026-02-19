import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCustomProtocol, init } from 'linkifyjs'
import './index.css'
import App from './App.jsx'

// Initialize linkify once with default schemes so BlockNote/Tiptap Link extension
// does not trigger "already initialized" warnings when multiple editors mount.
const LINK_PROTOCOLS = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp']
LINK_PROTOCOLS.forEach((scheme) => registerCustomProtocol(scheme))
init()

// Suppress linkifyjs "already initialized" warnings from Tiptap Link extension
const origWarn = console.warn
console.warn = (...args) => {
  if (args[0]?.includes?.('linkifyjs: already initialized')) return
  origWarn.apply(console, args)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
