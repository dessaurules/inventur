import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Gemeinsamer Einstieg: verhindert „leeres #root“, wenn die Seite per file:// geöffnet wird
 * (Module-URLs wie /assets/… sind dann ungültig).
 */
export function mountApp(App, props = {}) {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    console.error('[vibe-inventur] Im HTML fehlt <div id="root">.')
    return
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    rootEl.innerHTML = `<div style="font-family:system-ui,Segoe UI,sans-serif;padding:1.5rem;max-width:42rem;line-height:1.5;color:#0f172a">
<h1 style="font-size:1.125rem;margin:0 0 0.75rem">Aufruf über Datei (file://)</h1>
<p style="margin:0 0 0.75rem">Die App wird nicht geladen, weil der Browser Skripte unter <code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:4px">/assets/…</code> nicht findet.</p>
<p style="margin:0 0 0.75rem"><strong>So geht es:</strong> Entwicklung mit <code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:4px">npm run dev</code> und im Browser <code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:4px">http://localhost:5173/backend.html</code> öffnen. Oder <code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:4px">npm run build && npm start</code> und <code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:4px">http://localhost:3000/backend.html</code>.</p>
</div>`
    return
  }
  createRoot(rootEl).render(
    <StrictMode>
      <App {...props} />
    </StrictMode>,
  )
}
