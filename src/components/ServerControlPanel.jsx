import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { pb } from '../lib/pocketbase.js'
import { recordCanManageUsers } from '../lib/userCapabilities.js'

/** Catch-All-404 von server.mjs, wenn /api/control noch nicht registriert ist (alter Node-Prozess). */
function formatControlApiError(status, data) {
  const err = typeof data?.error === 'string' ? data.error : ''
  if (status === 404 && /API-Endpunkt nicht gefunden/i.test(err)) {
    return 'Der Express-Prozess auf diesem Port läuft vermutlich noch mit alter server.mjs (ohne /api/control). Terminal: Prozess beenden (Ctrl+C), dann npm run server neu starten.'
  }
  if (err) return err
  return `HTTP ${status}`
}

function StatusDot({ up }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', up ? 'bg-emerald-500' : 'bg-slate-300')}
      aria-hidden
    />
  )
}

function ServiceCard({
  title,
  port,
  up,
  managed,
  onStart,
  onStop,
  onRestart,
  busy,
  extra,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Port {port}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <StatusDot up={up} />
          {up ? 'erreichbar' : 'offline'}
        </div>
      </div>
      {extra ? <p className="mt-2 text-xs text-slate-500">{extra}</p> : null}
      {managed != null ? (
        <p className="mt-1 text-[11px] text-slate-400">
          {managed ? 'Vom Panel gestartet (Stopp möglich)' : 'Nicht vom Panel gestartet — Stopp nur wenn oben erkannt'}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onStart}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Start
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onStop}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Beenden
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRestart}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Neu starten
        </button>
      </div>
    </div>
  )
}

function controlFetchHeaders() {
  const t = String(pb.authStore.token || '').trim()
  if (!t) return {}
  return { Authorization: `Bearer ${t}` }
}

export function ServerControlPanel() {
  const [status, setStatus] = useState(null)
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [authTick, setAuthTick] = useState(0)

  useEffect(() => pb.authStore.onChange(() => setAuthTick((n) => n + 1), true), [])

  const token = String(pb.authStore.token || '').trim()
  const canUsePanel = Boolean(token) && recordCanManageUsers(pb.authStore.model ?? undefined)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/control/status', { headers: controlFetchHeaders() })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setStatus(null)
        setBanner(formatControlApiError(r.status, data))
        return
      }
      setStatus(data)
      setBanner('')
    } catch {
      setStatus(null)
      setBanner(
        'API nicht erreichbar. Diese Seite unter http://localhost:3000/server.html öffnen oder Express starten (npm run server).'
      )
    }
  }, [])

  useEffect(() => {
    if (!canUsePanel) {
      setStatus(null)
      setBanner('')
      return undefined
    }
    refresh()
    const id = setInterval(refresh, 2800)
    return () => clearInterval(id)
  }, [canUsePanel, refresh, authTick])

  const runAction = async (action, target) => {
    setBusy(true)
    setBanner('')
    try {
      const r = await fetch('/api/control/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...controlFetchHeaders() },
        body: JSON.stringify({ action, target }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setBanner(formatControlApiError(r.status, data))
      } else if (data.message) {
        setBanner(data.message)
      }
      await refresh()
    } catch (e) {
      setBanner(String(e.message || 'Anfrage fehlgeschlagen'))
    } finally {
      setBusy(false)
    }
  }

  const pbSvc = status?.pocketbase
  const viteSvc = status?.vite
  const expressSvc = status?.express

  if (!canUsePanel) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Server-Control</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {token
              ? 'Mit Ihrem Konto ist kein Zugriff auf das Server-Control erlaubt. Nur App-Administratoren (Rolle „admin“ bzw. Administrator-Flag) dürfen Dienste starten und beenden.'
              : 'Bitte melden Sie sich zuerst in der Inventur-App an (gleicher Browser, gleiche Adresse, z. B. localhost:3000). Danach diese Seite neu laden.'}
          </p>
          <a
            href="/index.html"
            className="mt-4 inline-block text-sm font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
          >
            Zur App
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Server-Control</h1>
            <p className="mt-1 text-sm text-slate-600">
              PocketBase, Vite-Dev und Express steuern — nur von diesem Rechner (localhost) und nur mit
              Administrator-Login, ähnlich einem lokalen Kontrollpanel.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Aktualisieren
          </button>
        </div>

        {banner ? (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="status"
          >
            {banner}
          </div>
        ) : null}

        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Alle Dienste</h2>
          <p className="mt-1 text-xs text-slate-500">Startet bzw. beendet PocketBase und Vite zusammen (Express läuft weiter).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('start', 'all')}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Alle starten
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('stop', 'all')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Alle beenden
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('restart', 'all')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Alle neu starten
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <ServiceCard
            title="Express (API + dieses Panel)"
            port={expressSvc?.port ?? 3000}
            up={Boolean(expressSvc?.up)}
            managed={null}
            extra="Wird nicht vom Panel beendet — Terminal: Ctrl+C oder Prozess beenden."
            onStart={() => runAction('start', 'express')}
            onStop={() => runAction('stop', 'express')}
            onRestart={() => runAction('restart', 'express')}
            busy={busy}
          />
          <ServiceCard
            title="PocketBase"
            port={pbSvc?.port ?? 8090}
            up={Boolean(pbSvc?.up)}
            managed={pbSvc?.managedByPanel}
            onStart={() => runAction('start', 'pb')}
            onStop={() => runAction('stop', 'pb')}
            onRestart={() => runAction('restart', 'pb')}
            busy={busy}
          />
          <ServiceCard
            title="Vite (Frontend-Entwicklung)"
            port={viteSvc?.port ?? 5173}
            up={Boolean(viteSvc?.up)}
            managed={viteSvc?.managedByPanel}
            extra="Nutzt npm run dev (strictPort 5173)."
            onStart={() => runAction('start', 'vite')}
            onStop={() => runAction('stop', 'vite')}
            onRestart={() => runAction('restart', 'vite')}
            busy={busy}
          />
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          Erster Start: <code className="rounded bg-slate-100 px-1">npm run server</code>, dann{' '}
          <code className="rounded bg-slate-100 px-1">/server.html</code>. Nach Code-Änderungen an der Steuerung: Express
          neu starten. Beenden/Neustarten vom Panel dauert oft 2–3 Sekunden (Kindprozesse). Nur Dienste, die du über
          „Start“ hier gestartet hast, lassen sich zuverlässig beenden; im Terminal gestartete Instanzen dort beenden
          (Ctrl+C). API-Zugriff nur mit Administrator-Token (PocketBase).
        </p>
      </div>
    </div>
  )
}
