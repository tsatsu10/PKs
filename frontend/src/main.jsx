import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import { missingSupabaseConfig } from './lib/config'
import ConfigError from './components/ConfigError'

// A build without its Supabase settings shows what's missing instead of a blank page (R13).
// The app itself loads only once the config is there, since importing it creates the client.
const missing = missingSupabaseConfig()
if (missing.length) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ConfigError missing={missing} />
    </StrictMode>,
  )
} else {
  import('./bootstrap.jsx').then((m) => m.start(), () => {
    // A stale deploy can remove the chunk: offer a reload rather than a blank page.
    const root = document.getElementById('root')
    const p = document.createElement('p')
    const button = document.createElement('button')
    p.textContent = 'PKS could not load. '
    button.type = 'button'
    button.textContent = 'Reload'
    button.onclick = () => window.location.reload()
    p.append(button)
    root.replaceChildren(p)
  })
}
