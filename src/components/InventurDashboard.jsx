import { useEffect, useMemo, useState } from 'react'
import { fetchArticleCatalogCount } from '../lib/articleCatalog'
import { loadInventurSessionLists, rowGesamtEuro } from '../lib/inventurHistory'
import { formatUnterlagerLabel } from '../lib/lagerAccess'

function formatDeDateShort(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(iso)
  }
}

function formatEur(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

function ownerLabel(rec) {
  const ex = rec?.expand?.session_owner
  if (!ex) return '—'
  const fn = String(ex.first_name ?? '').trim()
  const ln = String(ex.last_name ?? '').trim()
  const name = [fn, ln].filter(Boolean).join(' ')
  if (name) return name
  return String(ex.email ?? '').trim() || '—'
}

function unterlagerLine(rec) {
  const ul = rec?.expand?.unterlager
  if (!ul) return 'Alle Lager'
  return formatUnterlagerLabel(ul) || String(ul.name ?? '').trim() || 'Unterlager'
}

/**
 * Kacheln nur wenn keine Zählsession aktiv (Eltern rendert diese Komponente entsprechend).
 */
export function InventurDashboard({
  refreshTrigger,
  onJoinOpenSession,
  currentUser,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventuren, setInventuren] = useState([])
  const [openSessions, setOpenSessions] = useState([])
  const [openSessionsLoading, setOpenSessionsLoading] = useState(false)
  const [openSessionsError, setOpenSessionsError] = useState('')
  const [openSessionsPanel, setOpenSessionsPanel] = useState(false)
  const [catalogArticleCount, setCatalogArticleCount] = useState(null)

  useEffect(() => {
    if (!currentUser) {
      setOpenSessions([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setOpenSessionsLoading(true)
      setError('')
      setOpenSessionsError('')
      try {
        const { closedInventuren, openSessions: open } = await loadInventurSessionLists()
        if (!cancelled) {
          setInventuren(closedInventuren)
          setOpenSessions(open)
        }
      } catch (e) {
        if (!cancelled) {
          setInventuren([])
          setOpenSessions([])
          const msg = e?.response?.message || e?.message || 'Inventur-Daten konnten nicht geladen werden.'
          setError(msg)
          setOpenSessionsError(msg)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setOpenSessionsLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser, refreshTrigger])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const n = await fetchArticleCatalogCount()
        if (!cancelled) setCatalogArticleCount(n)
      } catch {
        if (!cancelled) setCatalogArticleCount(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTrigger])

  const stats = useMemo(() => {
    const latest = inventuren[0]
    const totalCountedLines = inventuren.reduce((acc, inv) => acc + inv.tableRows.length, 0)
    const lastWarenwert = latest
      ? latest.tableRows.reduce((acc, row) => acc + rowGesamtEuro(row), 0)
      : 0
    return {
      lastEnded: latest?.ended ?? null,
      lastLager: latest?.lagerLabel?.trim() || '',
      totalCountedLines,
      lastWarenwert,
      closedCount: inventuren.length,
    }
  }, [inventuren])

  const openCount = openSessions.length
  const openSessionsTileClass =
    openSessionsLoading || openSessionsError
      ? ''
      : openCount > 0
        ? ' inventur-dashboard-tile--open-sessions-busy'
        : ' inventur-dashboard-tile--open-sessions-clear'

  return (
    <section className="inventur-dashboard-section" aria-label="Überblick Inventur">
      {error ? (
        <p className="inventur-dashboard-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="inventur-dashboard-grid">
        <button
          type="button"
          className={`inventur-dashboard-tile inventur-dashboard-tile--button${openSessionsTileClass}`}
          onClick={() => setOpenSessionsPanel(true)}
          aria-haspopup="dialog"
          aria-expanded={openSessionsPanel}
        >
          <h3 className="inventur-dashboard-tile-label">Offene Sessions</h3>
          <p className="inventur-dashboard-tile-value">
            {openSessionsLoading
              ? '…'
              : openSessionsError
                ? '—'
                : openCount > 0
                  ? String(openCount)
                  : 'Keine offen Session'}
          </p>
          <p className="inventur-dashboard-tile-sub">
            {openSessionsLoading
              ? 'Wird geladen …'
              : openSessionsError
                ? 'Status konnte nicht geladen werden.'
                : openCount > 0
                  ? 'Tippen, um einer laufenden Zählung beizutreten'
                  : 'Aktuell läuft keine gemeinsame Zählung'}
          </p>
        </button>

        <article className="inventur-dashboard-tile">
          <h3 className="inventur-dashboard-tile-label">Letzte Inventur</h3>
          <p className="inventur-dashboard-tile-value">
            {loading ? (
              '…'
            ) : stats.lastEnded ? (
              <time dateTime={stats.lastEnded}>{formatDeDateShort(stats.lastEnded)}</time>
            ) : (
              '—'
            )}
          </p>
          <p className="inventur-dashboard-tile-sub">
            {loading ? '\u00a0' : stats.lastLager || 'Kein Ort hinterlegt'}
          </p>
        </article>

        <article className="inventur-dashboard-tile">
          <h3 className="inventur-dashboard-tile-label">Gezählte Artikel (insgesamt)</h3>
          <p className="inventur-dashboard-tile-value">
            {loading ? '…' : String(stats.totalCountedLines)}
          </p>
          <p className="inventur-dashboard-tile-sub">Summe aller Positionen mit Menge &gt; 0</p>
        </article>

        <article className="inventur-dashboard-tile">
          <h3 className="inventur-dashboard-tile-label">Aktueller Warenwert</h3>
          <p className="inventur-dashboard-tile-value">
            {loading ? '…' : stats.closedCount === 0 ? '—' : formatEur(stats.lastWarenwert)}
          </p>
          <p className="inventur-dashboard-tile-sub">Laut letzter abgeschlossener Inventur</p>
        </article>

        <article className="inventur-dashboard-tile">
          <h3 className="inventur-dashboard-tile-label">Abgeschlossene Inventuren</h3>
          <p className="inventur-dashboard-tile-value">{loading ? '…' : String(stats.closedCount)}</p>
          <p className="inventur-dashboard-tile-sub">Anzahl erfasster Zählungen</p>
        </article>

        <article className="inventur-dashboard-tile">
          <h3 className="inventur-dashboard-tile-label">Artikel im Katalog</h3>
          <p className="inventur-dashboard-tile-value">
            {catalogArticleCount == null ? '…' : String(catalogArticleCount)}
          </p>
          <p className="inventur-dashboard-tile-sub">Einträge im Magazin (PocketBase)</p>
        </article>
      </div>

      {openSessionsPanel ? (
        <div
          className="inventur-open-sessions-backdrop"
          role="presentation"
          onClick={() => setOpenSessionsPanel(false)}
        >
          <div
            className="inventur-open-sessions-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventur-open-sessions-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inventur-open-sessions-head">
              <h2 id="inventur-open-sessions-title" className="inventur-open-sessions-title">
                Offene Sessions
              </h2>
              <button
                type="button"
                className="inventur-open-sessions-close"
                onClick={() => setOpenSessionsPanel(false)}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            {openSessionsError ? (
              <p className="inventur-dashboard-error" role="alert">
                {openSessionsError}
              </p>
            ) : null}
            {openSessionsLoading ? (
              <p className="inventur-open-sessions-empty">Lade …</p>
            ) : openSessions.length === 0 ? (
              <p className="inventur-open-sessions-empty">Keine offen Session.</p>
            ) : (
              <ul className="inventur-open-sessions-list">
                {openSessions.map((s) => (
                  <li key={s.id} className="inventur-open-sessions-item">
                    <div className="inventur-open-sessions-item-text">
                      <span className="inventur-open-sessions-item-meta">
                        <time dateTime={s.started}>{formatDeDateShort(s.started)}</time>
                        <span className="inventur-open-sessions-item-sep" aria-hidden="true">
                          ·
                        </span>
                        <span>{unterlagerLine(s)}</span>
                      </span>
                      <span className="inventur-open-sessions-item-owner">
                        Besitzer: {ownerLabel(s)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="inventur-open-sessions-join"
                      onClick={() => {
                        setOpenSessionsPanel(false)
                        onJoinOpenSession?.(s.id)
                      }}
                    >
                      Beitreten
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
