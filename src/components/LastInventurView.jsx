import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Archive, ChevronDown, Download, History, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { exportInventurCsv, exportInventurPdf, groupTableRowsByCategory } from '../lib/inventurExport'
import { loadClosedInventurenWithRows, rowGesamtEuro } from '../lib/inventurHistory'
import { pb } from '../lib/pocketbase'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { formatUnterlagerLabel } from '../lib/lagerAccess'
import { userCanEndZaehlSession } from '../lib/zaehlSessionAccess'
import { normalizeSessionPositionen } from '../lib/sessionSnapshot'
import { avatarInitials } from '../lib/avatarInitials'
import { cn } from '../lib/cn.js'

function formatDeDateShort(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

function formatDeDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Kürzer für Tabellenzeilen (ohne horizontales Scrollen). */
function formatDeDateTimeCompact(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    return `${date} ${time}`
  } catch {
    return '—'
  }
}

function formatRelativeDe(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'vor wenigen Sekunden'
  const min = Math.floor(sec / 60)
  if (min < 60) return `vor ${min} Min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1) return 'gestern'
  if (d < 7) return `vor ${d} Tagen`
  return formatDeDateShort(iso)
}

/** Bezeichnung ohne Lager: z. B. Q1 2026 */
function inventurNameFromIso(iso) {
  if (!iso) return 'Inventur'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Inventur'
  const q = Math.floor(d.getMonth() / 3) + 1
  const y = d.getFullYear()
  return `Q${q} ${y}`
}

function formatEurIntl(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

function formatMengeDisplay(n) {
  const v = Math.max(0, Number(n) || 0)
  const r = Math.round(v * 100) / 100
  if (r % 1 === 0) return String(r)
  return String(r).replace('.', ',')
}

function formatOpenSessionOwner(rec) {
  const ex = rec?.expand?.session_owner
  if (!ex) return '—'
  const fn = String(ex.first_name ?? '').trim()
  const ln = String(ex.last_name ?? '').trim()
  const name = [fn, ln].filter(Boolean).join(' ')
  if (name) return name
  return String(ex.email ?? '').trim() || '—'
}

function openSessionErfasser(rec) {
  const ex = rec?.expand?.session_owner
  if (!ex) return { name: '—', initials: '—' }
  return {
    name: formatOpenSessionOwner(rec),
    initials: avatarInitials(ex.first_name, ex.last_name, ex.email),
  }
}

function openSessionOrt(rec) {
  const ul = rec?.expand?.unterlager
  if (!ul) return 'Alle Lager'
  return formatUnterlagerLabel(ul) || String(ul.name ?? '').trim() || 'Unterlager'
}

function openUnterlagerId(rec) {
  const ul = rec?.expand?.unterlager
  return (
    ul?.id ??
    (typeof rec.unterlager === 'string' ? rec.unterlager : rec.unterlager?.id) ??
    null
  )
}

function lagerTabellenLabel(ortRaw) {
  const o = String(ortRaw ?? '').trim()
  if (!o || o === 'Alle Lager') return 'Mehrere'
  return o
}

/** @param {string | null} iso @param {'all'|'30d'|'year'|'quarter'|'12m'|'custom'} preset */
function isoInZeitraum(iso, preset, now = new Date()) {
  if (!iso || preset === 'all' || preset === 'custom') return true
  try {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return true
    if (preset === '30d') {
      const cut = new Date(now)
      cut.setDate(cut.getDate() - 30)
      return t >= cut.getTime()
    }
    if (preset === 'year') {
      const y = new Date(now.getFullYear(), 0, 1).getTime()
      return t >= y
    }
    if (preset === '12m') {
      const cut = new Date(now)
      cut.setFullYear(cut.getFullYear() - 1)
      return t >= cut.getTime()
    }
    if (preset === 'quarter') {
      const y = now.getFullYear()
      const m = now.getMonth()
      const q = Math.floor(m / 3)
      const startMs =
        q === 0 ? new Date(y - 1, 9, 1).getTime() : new Date(y, (q - 1) * 3, 1).getTime()
      const startDate = new Date(startMs)
      const endMs = new Date(startDate.getFullYear(), startDate.getMonth() + 3, 1).getTime()
      return t >= startMs && t < endMs
    }
    return true
  } catch {
    return true
  }
}

function StatusPill({ status, compact = false }) {
  const label =
    status === 'laufend' ? 'Laufend' : status === 'archiviert' ? 'Archiviert' : 'Abgeschlossen'
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-full border font-medium tabular-nums',
        compact ? 'h-[18px] px-1.5 text-[10px]' : 'h-5 gap-1 px-2 text-[11px]',
        status === 'laufend' && 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100',
        status === 'abgeschlossen' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
        status === 'archiviert' && 'border-border bg-muted/80 text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded-full',
          compact ? 'h-0.5 w-0.5' : 'h-1 w-1',
          status === 'laufend' && 'bg-amber-500',
          status === 'abgeschlossen' && 'bg-emerald-500',
          status === 'archiviert' && 'bg-muted-foreground/70'
        )}
        aria-hidden
      />
      <span className={cn(compact && 'min-w-0 truncate')}>{label}</span>
    </span>
  )
}

/**
 * Linke Spalte wie `SidebarCategories` im Magazin: fester Rand, Scroll-Nav, Kennzahlen-Block.
 * @param {object} props
 * @param {'all'|'running'|'done'|'archived'} props.statusTab
 * @param {(t: 'all'|'running'|'done'|'archived') => void} props.onStatusTab
 * @param {{ all: number, running: number, done: number, archived: number }} props.tabCounts
 * @param {object} props.kpi
 */
function InventurNavSidebar({ statusTab, onStatusTab, tabCounts, kpi }) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Ansicht
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2" aria-label="Inventur-Ansicht">
        <div className="flex flex-col gap-0.5">
          {(
            [
              ['all', 'Alle', tabCounts.all],
              ['running', 'Laufend', tabCounts.running],
              ['done', 'Abgeschlossen', tabCounts.done],
              ['archived', 'Archiviert', tabCounts.archived],
            ]
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px]',
                statusTab === key
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              onClick={() => onStatusTab(/** @type {'all'|'running'|'done'|'archived'} */ (key))}
            >
              <span className="min-w-0 truncate">{label}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">Kennzahlen</div>
          <dl className="space-y-2.5 px-2 text-[12px]">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Anzahl ({kpi.yearLabel})
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-foreground">{kpi.countYear}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Summe (Jahr)
              </dt>
              <dd className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                {formatEurIntl(kpi.sumYear)}
              </dd>
              {kpi.yoyPct != null ? (
                <dd
                  className={cn(
                    'mt-1 text-[11px] font-medium tabular-nums',
                    kpi.yoyPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                  )}
                >
                  {kpi.yoyPct >= 0 ? '+' : ''}
                  {String(kpi.yoyPct).replace('.', ',')} % ggü. {Number(kpi.yearLabel) - 1}
                </dd>
              ) : (
                <dd className="mt-1 text-[11px] text-muted-foreground">Kein Vorjahresvergleich</dd>
              )}
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Zuletzt
              </dt>
              <dd className="mt-0.5 text-foreground">{kpi.lastRelative}</dd>
              <dd className="text-[11px] leading-snug text-muted-foreground">{kpi.lastSub}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Laufend</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-foreground">{kpi.runningCount}</dd>
              <dd className="text-[11px] leading-snug text-muted-foreground">{kpi.runSub}</dd>
            </div>
          </dl>
        </div>
      </nav>
    </aside>
  )
}

/** Gruppierung für Balken: primär Unterlager (ID), Anzeige Unterlagername; sonst Lager/—. */
function groupRowsByUnterlager(rows) {
  const m = new Map()
  for (const row of rows) {
    const id = String(row.unterlager_id ?? '').trim()
    const un = String(row.unterlager_name ?? '').trim()
    const ln = String(row.lager_name ?? '').trim()
    let key
    let label
    if (id) {
      key = `id:${id}`
      label = un || ln || id
    } else if (un) {
      key = `name:${un}`
      label = un
    } else if (ln) {
      key = `lager:${ln}`
      label = ln
    } else {
      key = '—'
      label = '—'
    }
    if (!m.has(key)) m.set(key, { label, list: [] })
    m.get(key).list.push(row)
  }
  return [...m.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
    .map((v) => [v.label, v.list])
}

/**
 * @param {object} props
 * @param {number} props.refreshTrigger
 * @param {object | null} props.currentUser
 * @param {(sessionId: string) => Promise<{ ok?: boolean, message?: string } | void>} [props.onEndOpenSession]
 * @param {() => void | Promise<void>} [props.onNeueInventur]
 * @param {boolean} [props.neueInventurBusy]
 */
export function LastInventurView({
  refreshTrigger,
  currentUser,
  onEndOpenSession,
  onNeueInventur,
  neueInventurBusy,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventuren, setInventuren] = useState([])
  const [filterUnterlagerId, setFilterUnterlagerId] = useState('')
  const [openSessions, setOpenSessions] = useState([])
  const [openSessionsLoading, setOpenSessionsLoading] = useState(false)
  const [openSessionsError, setOpenSessionsError] = useState('')
  const [endingSessionId, setEndingSessionId] = useState(null)
  const [remoteEndMessage, setRemoteEndMessage] = useState('')

  const [statusTab, setStatusTab] = useState(/** @type {'all'|'running'|'done'|'archived'} */ ('all'))
  const [zeitPreset, setZeitPreset] = useState(
    /** @type {'all'|'30d'|'year'|'quarter'|'12m'} */ ('30d')
  )

  const [selectedRowId, setSelectedRowId] = useState(/** @type {string | null} */ (null))
  const [inventurMutateBusy, setInventurMutateBusy] = useState(false)
  const [menuRowId, setMenuRowId] = useState(/** @type {string | null} */ (null))
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const [panelProUnterlager, setPanelProUnterlager] = useState(false)
  const [panelShowAllPositions, setPanelShowAllPositions] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const unterlagerFilterOptions = useMemo(() => {
    const m = new Map()
    for (const inv of inventuren) {
      if (!inv.unterlagerId || !inv.lagerLabel) continue
      if (!m.has(inv.unterlagerId)) m.set(inv.unterlagerId, inv.lagerLabel)
    }
    for (const s of openSessions) {
      const id = openUnterlagerId(s)
      const lab = openSessionOrt(s)
      if (id && lab && lab !== 'Alle Lager') m.set(id, lab)
    }
    return [...m.entries()].sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), 'de', { sensitivity: 'base' })
    )
  }, [inventuren, openSessions])

  /** Live-Aktualisierung ohne Vollbild-Ladezustand (PocketBase Realtime). */
  const reloadInventurListenLive = useCallback(async () => {
    if (!currentUser) return
    try {
      const [closed, list] = await Promise.all([
        loadClosedInventurenWithRows(),
        pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
          sort: '-started',
          expand: 'unterlager.lager,session_owner',
          requestKey: null,
        }),
      ])
      setInventuren(closed)
      setOpenSessions(list.filter((r) => !r.ended))
    } catch {
      /* bei Bedarf weiterhin manuell per refreshTrigger */
    }
  }, [currentUser])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const result = await loadClosedInventurenWithRows()
        if (cancelled) return
        setInventuren(result)
        setFilterUnterlagerId('')
        setSelectedRowId(null)
      } catch (e) {
        if (cancelled) return
        setInventuren([])
        setError(
          e?.response?.message ||
            e?.message ||
            'Abgeschlossene Inventuren konnten nicht geladen werden.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTrigger])

  useEffect(() => {
    if (!currentUser) {
      setOpenSessions([])
      return
    }
    let cancelled = false
    ;(async () => {
      setOpenSessionsLoading(true)
      setOpenSessionsError('')
      try {
        const list = await pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
          sort: '-started',
          expand: 'unterlager.lager,session_owner',
          requestKey: null,
        })
        if (!cancelled) setOpenSessions(list.filter((r) => !r.ended))
      } catch (e) {
        if (!cancelled) {
          setOpenSessions([])
          setOpenSessionsError(
            e?.response?.message || e?.message || 'Offene Sessions konnten nicht geladen werden.'
          )
        }
      } finally {
        if (!cancelled) setOpenSessionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser, refreshTrigger])

  /**
   * PocketBase Realtime: bei Änderungen an Sessions oder Archiv die Liste nachziehen.
   * (Kein Express-Webhook — PB pusht per WebSocket; ohne WS z. B. hinter manchen Proxies schlägt subscribe fehl.)
   */
  useEffect(() => {
    if (!currentUser) return undefined
    let cancelled = false
    let debounceTimer = 0
    /** @type {(() => void | Promise<void>)[]} */
    const unsubscribeFns = []

    const scheduleReload = () => {
      if (cancelled) return
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        if (cancelled) return
        void reloadInventurListenLive()
      }, 450)
    }

    ;(async () => {
      try {
        const unsub = await pb.collection(PB_COLLECTIONS.zaehlSessions).subscribe('*', scheduleReload)
        if (!cancelled && typeof unsub === 'function') unsubscribeFns.push(unsub)
      } catch {
        /* z. B. kein WebSocket */
      }
      try {
        const unsub = await pb.collection(PB_COLLECTIONS.inventurArchiv).subscribe('*', scheduleReload)
        if (!cancelled && typeof unsub === 'function') unsubscribeFns.push(unsub)
      } catch {
        /* … */
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(debounceTimer)
      for (const fn of unsubscribeFns) {
        Promise.resolve(fn()).catch(() => {})
      }
    }
  }, [currentUser, reloadInventurListenLive])

  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRowId) return
      const el = menuRef.current
      if (el && !el.contains(e.target)) setMenuRowId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuRowId])

  useEffect(() => {
    const onDoc = (e) => {
      if (!exportMenuOpen) return
      const el = exportMenuRef.current
      if (el && !el.contains(e.target)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportMenuOpen])

  const unifiedRows = useMemo(() => {
    const out = []

    for (const inv of inventuren) {
      const sum = inv.tableRows.reduce((acc, row) => acc + rowGesamtEuro(row), 0)
      const ortRaw = inv.lagerLabel?.trim() || 'Alle Lager'
      const nameIso = inv.ended || inv.started
      const isArch = inv.archiviert === true
      out.push({
        kind: 'closed',
        id: inv.id,
        bezeichnung: inventurNameFromIso(nameIso),
        started: inv.started ?? null,
        ended: inv.ended ?? null,
        status: isArch ? 'archiviert' : 'abgeschlossen',
        archiviert: isArch,
        lagerDisplay: lagerTabellenLabel(ortRaw),
        ortRaw,
        erfasser: inv.erfasser ?? { name: '—', initials: '—' },
        gesamtwert: sum,
        positionenAnzahl: inv.tableRows.length,
        tableRows: inv.tableRows,
        unterlagerId: inv.unterlagerId ?? null,
      })
    }

    for (const s of openSessions) {
      const tr = normalizeSessionPositionen(s.positionen).filter((r) => Number(r?.gezaehlte_menge) > 0)
      const sum = tr.reduce((acc, row) => acc + rowGesamtEuro(row), 0)
      const ortRaw = openSessionOrt(s)
      out.push({
        kind: 'open',
        id: s.id,
        bezeichnung: inventurNameFromIso(s.started),
        started: s.started ?? null,
        ended: null,
        status: 'laufend',
        lagerDisplay: lagerTabellenLabel(ortRaw),
        ortRaw,
        erfasser: openSessionErfasser(s),
        gesamtwert: tr.length ? sum : null,
        positionenAnzahl: tr.length,
        tableRows: tr,
        unterlagerId: openUnterlagerId(s),
        session: s,
        archiviert: false,
      })
    }

    return out
  }, [inventuren, openSessions])

  const sortedForNr = useMemo(() => {
    return [...unifiedRows].sort((a, b) => {
      const ta = new Date((a.ended || a.started || '') + '').getTime()
      const tb = new Date((b.ended || b.started || '') + '').getTime()
      return tb - ta
    })
  }, [unifiedRows])

  const displayNrForRow = useCallback((row) => {
    const idx = sortedForNr.findIndex((r) => r.id === row.id)
    if (idx < 0) return 0
    return sortedForNr.length - idx
  }, [sortedForNr])

  const kpi = useMemo(() => {
    const y = new Date().getFullYear()
    const inYearEnded = (inv) => {
      if (!inv.ended) return false
      const d = new Date(inv.ended)
      return Number.isFinite(d.getTime()) && d.getFullYear() === y
    }
    const inYearStartedOpen = (s) => {
      if (!s.started) return false
      const d = new Date(s.started)
      return Number.isFinite(d.getTime()) && d.getFullYear() === y
    }
    const countYear = inventuren.filter(inYearEnded).length + openSessions.filter(inYearStartedOpen).length
    const sumYear = inventuren.filter(inYearEnded).reduce(
      (acc, inv) => acc + inv.tableRows.reduce((a, r) => a + rowGesamtEuro(r), 0),
      0
    )
    const prevY = y - 1
    const sumPrev = inventuren
      .filter((inv) => {
        if (!inv.ended) return false
        const d = new Date(inv.ended)
        return Number.isFinite(d.getTime()) && d.getFullYear() === prevY
      })
      .reduce((acc, inv) => acc + inv.tableRows.reduce((a, r) => a + rowGesamtEuro(r), 0), 0)
    let yoyPct = null
    if (sumPrev > 0 && Number.isFinite(sumYear)) {
      yoyPct = Math.round(((sumYear - sumPrev) / sumPrev) * 1000) / 10
    }
    const latestU = sortedForNr.find((r) => r.kind === 'closed' && r.ended)
    let lastSub = 'Noch keine abgeschlossene Inventur'
    if (latestU) {
      const n = displayNrForRow(latestU)
      const ort =
        latestU.ortRaw && latestU.ortRaw !== 'Alle Lager' ? latestU.ortRaw : latestU.bezeichnung
      lastSub = `#${n} · ${ort}`
    }
    const firstOpenRow = sortedForNr.find((r) => r.kind === 'open')
    let runSub = 'Keine laufende Inventur'
    if (firstOpenRow) {
      const n = displayNrForRow(firstOpenRow)
      const ort = firstOpenRow.ortRaw && firstOpenRow.ortRaw !== 'Alle Lager' ? firstOpenRow.ortRaw : firstOpenRow.bezeichnung
      runSub = `#${n} · ${ort}`
    }
    return {
      countYear,
      yearLabel: String(y),
      sumYear,
      yoyPct,
      lastRelative: latestU?.ended ? formatRelativeDe(latestU.ended) : '—',
      lastSub,
      runningCount: openSessions.length,
      runSub,
    }
  }, [inventuren, openSessions, sortedForNr, displayNrForRow])

  const tabCounts = useMemo(
    () => ({
      all: unifiedRows.length,
      running: unifiedRows.filter((r) => r.status === 'laufend').length,
      done: unifiedRows.filter((r) => r.status === 'abgeschlossen').length,
      archived: unifiedRows.filter((r) => r.status === 'archiviert').length,
    }),
    [unifiedRows]
  )

  const filteredRows = useMemo(() => {
    let list = [...unifiedRows]

    if (statusTab === 'running') list = list.filter((r) => r.status === 'laufend')
    else if (statusTab === 'done') list = list.filter((r) => r.status === 'abgeschlossen')
    else if (statusTab === 'archived') list = list.filter((r) => r.status === 'archiviert')

    if (filterUnterlagerId) {
      list = list.filter((r) => r.unterlagerId === filterUnterlagerId)
    }

    list = list.filter((r) => {
      const iso = r.kind === 'closed' ? r.ended : r.started
      return isoInZeitraum(iso, zeitPreset)
    })

    list.sort((a, b) => {
      const ta = new Date((a.ended || a.started || '') + '').getTime()
      const tb = new Date((b.ended || b.started || '') + '').getTime()
      return tb - ta
    })

    return list
  }, [unifiedRows, statusTab, filterUnterlagerId, zeitPreset])

  useEffect(() => {
    if (loading || error) return
    if (filteredRows.length === 0) {
      setSelectedRowId(null)
      return
    }
    if (selectedRowId && !filteredRows.some((r) => r.id === selectedRowId)) {
      setSelectedRowId(null)
    }
  }, [filteredRows, selectedRowId, loading, error])

  useEffect(() => {
    if (selectedRowId && !unifiedRows.some((r) => r.id === selectedRowId)) {
      setSelectedRowId(null)
    }
  }, [unifiedRows, selectedRowId])

  useEffect(() => {
    setPanelProUnterlager(false)
    setPanelShowAllPositions(false)
    setExportMenuOpen(false)
  }, [selectedRowId])

  const selectedRow = useMemo(
    () => filteredRows.find((r) => r.id === selectedRowId) ?? unifiedRows.find((r) => r.id === selectedRowId) ?? null,
    [filteredRows, unifiedRows, selectedRowId]
  )

  const exportRow = useCallback(
    (row, nrDisplay, format) => {
      if (!row || row.kind !== 'closed') return
      const payload = {
        nr: nrDisplay,
        ended: row.ended || undefined,
        started: row.started || undefined,
        tableRows: row.tableRows,
        lagerLabel: row.ortRaw && row.ortRaw !== 'Alle Lager' ? row.ortRaw : undefined,
      }
      if (format === 'csv') exportInventurCsv(payload)
      else exportInventurPdf(payload)
    },
    []
  )

  const refreshInventuren = useCallback(async () => {
    try {
      const result = await loadClosedInventurenWithRows()
      setInventuren(result)
    } catch {
      /* Liste bleibt */
    }
  }, [])

  const deleteArchivEntries = async (sessionId) => {
    const sid = String(sessionId).replace(/"/g, '\\"')
    const list = await pb.collection(PB_COLLECTIONS.inventurArchiv).getFullList({
      filter: `inventur_id="${sid}"`,
      requestKey: null,
    })
    for (const r of list) {
      await pb.collection(PB_COLLECTIONS.inventurArchiv).delete(r.id, { requestKey: null })
    }
  }

  const handleArchiveInventur = async () => {
    if (!selectedRow || selectedRow.kind !== 'closed' || selectedRow.archiviert) return
    if (!window.confirm('Diese Inventur archivieren? Sie erscheint danach unter „Archiviert“.')) return
    setInventurMutateBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.zaehlSessions).update(selectedRow.id, { archiviert: true })
      toast.success('Inventur archiviert.')
      await refreshInventuren()
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || 'Archivieren fehlgeschlagen.')
    } finally {
      setInventurMutateBusy(false)
    }
  }

  const handleRestoreInventur = async () => {
    if (!selectedRow || selectedRow.kind !== 'closed' || !selectedRow.archiviert) return
    setInventurMutateBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.zaehlSessions).update(selectedRow.id, { archiviert: false })
      toast.success('Inventur wieder geöffnet (nicht mehr archiviert).')
      await refreshInventuren()
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || 'Wiederöffnen fehlgeschlagen.')
    } finally {
      setInventurMutateBusy(false)
    }
  }

  const handleDeleteInventur = async () => {
    if (!selectedRow || selectedRow.kind !== 'closed') return
    if (
      !window.confirm(
        'Diese Inventur unwiderruflich löschen? Session und zugehörige Archiv-Einträge werden entfernt.'
      )
    )
      return
    setInventurMutateBusy(true)
    try {
      await deleteArchivEntries(selectedRow.id)
      await pb.collection(PB_COLLECTIONS.zaehlSessions).delete(selectedRow.id, { requestKey: null })
      toast.success('Inventur gelöscht.')
      setSelectedRowId(null)
      await refreshInventuren()
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || 'Löschen fehlgeschlagen.')
    } finally {
      setInventurMutateBusy(false)
    }
  }

  const renderBarSection = (label, rows) => {
    const groups = groupTableRowsByCategory(rows)
    const total = rows.reduce((a, r) => a + rowGesamtEuro(r), 0) || 1
    return (
      <div className="space-y-3">
        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</h4>
        <div className="space-y-3.5">
          {groups.map(([cat, list]) => {
            const catSum = list.reduce((a, r) => a + rowGesamtEuro(r), 0)
            const pct = Math.round((catSum / total) * 1000) / 10
            const w = Math.max(2, Math.min(100, (catSum / total) * 100))
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 break-words text-[12.5px] leading-snug text-foreground" title={cat}>
                    {cat}
                  </span>
                  <span className="shrink-0 text-right text-[12.5px] tabular-nums text-foreground">
                    {formatEurIntl(catSum)}{' '}
                    <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${w}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderUnterlagerBars = (rows) => {
    const groups = groupRowsByUnterlager(rows)
    const total = rows.reduce((a, r) => a + rowGesamtEuro(r), 0) || 1
    return (
      <div className="space-y-3">
        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nach Unterlager</h4>
        <div className="space-y-3.5">
          {groups.map(([ulName, list], idx) => {
            const s = list.reduce((a, r) => a + rowGesamtEuro(r), 0)
            const pct = Math.round((s / total) * 1000) / 10
            const w = Math.max(2, Math.min(100, (s / total) * 100))
            return (
              <div key={`ul-${idx}-${String(list[0]?.unterlager_id ?? '')}-${ulName}`} className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 break-words text-[12.5px] leading-snug text-foreground"
                    title={ulName}
                  >
                    {ulName}
                  </span>
                  <span className="shrink-0 text-right text-[12.5px] tabular-nums text-foreground">
                    {formatEurIntl(s)} <span className="text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/75" style={{ width: `${w}%` }} aria-hidden />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const feedbackBlock =
    remoteEndMessage || openSessionsError ? (
      <div className="shrink-0 space-y-2 px-3 pt-2">
        {remoteEndMessage ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive" role="alert">
            {remoteEndMessage}
          </p>
        ) : null}
        {openSessionsError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive" role="alert">
            {openSessionsError}
          </p>
        ) : null}
      </div>
    ) : null

  const inventurListTitle =
    statusTab === 'all'
      ? 'Alle'
      : statusTab === 'running'
        ? 'Laufend'
        : statusTab === 'done'
          ? 'Abgeschlossen'
          : 'Archiviert'

  const inventurShellTopBar = (
    <div className="flex h-12 shrink-0 items-center border-b border-border bg-background px-3">
      <span className="text-sm font-semibold text-foreground" id="inventuren-page-title">
        Inventuren
      </span>
    </div>
  )

  const inventurListHeader = !loading && !error && (
    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">{inventurListTitle}</h2>
        <p className="text-[12px] text-muted-foreground tabular-nums">{filteredRows.length} Einträge</p>
      </div>
      {onNeueInventur ? (
        <button
          type="button"
          onClick={() => void onNeueInventur()}
          disabled={Boolean(neueInventurBusy)}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground',
            'hover:opacity-90 disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {neueInventurBusy ? '…' : 'Neue Inventur'}
        </button>
      ) : null}
    </header>
  )

  /** Wie `ArticleListToolbar`: nur Zeitraum und Lager (Status liegt in der linken Spalte). */
  const filterBar = !loading && !error && (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
      <select
        value={zeitPreset}
        onChange={(e) => setZeitPreset(/** @type {any} */ (e.target.value))}
        className={cn(
          'h-8 min-w-[11rem] rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground',
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label="Zeitraum"
      >
        <option value="30d">Letzte 30 Tage</option>
        <option value="all">Gesamter Zeitraum</option>
        <option value="year">Dieses Jahr</option>
        <option value="quarter">Letztes Quartal</option>
        <option value="12m">Letzte 12 Monate</option>
      </select>
      {unterlagerFilterOptions.length > 0 ? (
        <select
          value={filterUnterlagerId}
          onChange={(e) => {
            setFilterUnterlagerId(e.target.value)
            setMenuRowId(null)
          }}
          className={cn(
            'h-8 min-w-[10rem] rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground',
            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label="Lager"
        >
          <option value="">Lager: Alle</option>
          {unterlagerFilterOptions.map(([uid, lab]) => (
            <option key={uid} value={uid}>
              {lab}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )

  const exportNr = selectedRow ? displayNrForRow(selectedRow) : 0
  /** Wie Magazin `drawerOpen`: Steuert `aria-hidden` und `max-[1180px]:hidden` am Detail-Panel. */
  const drawerOpen = Boolean(selectedRowId)

  const detailPanelTitle =
    selectedRow && selectedRow.ortRaw && selectedRow.ortRaw !== 'Alle Lager'
      ? selectedRow.ortRaw
      : selectedRow?.bezeichnung ?? '—'

  const detailPanel = (
    <aside
      className={cn(
        'flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l border-border bg-background',
        'max-[1180px]:fixed max-[1180px]:inset-y-0 max-[1180px]:right-0 max-[1180px]:z-40 max-[1180px]:shadow-xl',
        !drawerOpen && 'max-[1180px]:hidden'
      )}
      aria-label="Inventur-Details"
      aria-hidden={!drawerOpen}
    >
      {!selectedRow ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted-foreground">
          Wähle eine Inventur in der Liste.
        </div>
      ) : (
        <>
          <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[12px] text-muted-foreground tabular-nums">#{exportNr}</p>
                <StatusPill status={selectedRow.status} />
              </div>
              <h3 className="truncate text-sm font-semibold text-foreground">{detailPanelTitle}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {selectedRow.started && selectedRow.ended
                  ? `${formatDeDateTime(selectedRow.started)} – ${formatDeDateTime(selectedRow.ended)}`
                  : selectedRow.started
                    ? `${formatDeDateTime(selectedRow.started)} – …`
                    : '—'}
                {' · '}
                {selectedRow.erfasser?.name ?? '—'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Detail schließen"
              onClick={() => setSelectedRowId(null)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <ScrollArea.Root className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea.Viewport className="h-full max-h-full">
              <div className="space-y-4 p-3 pb-6">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-background p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Positionen</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{selectedRow.positionenAnzahl}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Gesamtsumme</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {selectedRow.gesamtwert != null ? formatEurIntl(selectedRow.gesamtwert) : '—'}
                </p>
              </div>
            </div>

            <section aria-label="Aufschlüsselung">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Aufschlüsselung
              </h3>
              {selectedRow.tableRows.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Keine gezählten Positionen.</p>
              ) : (
                <>
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={panelProUnterlager}
                      onChange={(e) => setPanelProUnterlager(e.target.checked)}
                    />
                    Pro Unterlager
                  </label>
                  {renderBarSection('Nach Kategorie', selectedRow.tableRows)}
                  {panelProUnterlager ? (
                    <div className="mt-6">{renderUnterlagerBars(selectedRow.tableRows)}</div>
                  ) : null}
                </>
              )}
            </section>

            <section aria-label="Positionen">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Positionen ({selectedRow.positionenAnzahl})
                </h3>
                {selectedRow.tableRows.length > 5 ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-primary hover:underline"
                    onClick={() => setPanelShowAllPositions((v) => !v)}
                  >
                    {panelShowAllPositions ? 'Weniger' : 'Alle anzeigen'}
                    {!panelShowAllPositions ? ' >' : ''}
                  </button>
                ) : null}
              </div>
              {selectedRow.tableRows.length === 0 ? null : (
                <ul className="space-y-2 text-[12.5px]">
                  {[...selectedRow.tableRows]
                    .sort((a, b) => rowGesamtEuro(b) - rowGesamtEuro(a))
                    .slice(0, panelShowAllPositions ? undefined : 5)
                    .map((row, i) => (
                      <li
                        key={`pos-${row.artikel_id ?? 'x'}-${row.name ?? ''}-${i}`}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-2"
                      >
                        <span className="min-w-0 truncate text-foreground">{row.name ?? '—'}</span>
                        <span className="shrink-0 tabular-nums text-foreground">
                          {formatMengeDisplay(row.gezaehlte_menge)}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">
                          {formatEurIntl(rowGesamtEuro(row))}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar
              orientation="vertical"
              className="flex w-2 touch-none select-none bg-muted/40 p-0.5"
            >
              <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>

          <footer className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3">
            {selectedRow.kind === 'closed' ? (
              <button
                type="button"
                disabled={inventurMutateBusy}
                onClick={() => void handleDeleteInventur()}
                className={cn(
                  'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40',
                  'bg-background text-[12px] font-medium text-destructive',
                  'hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-45'
                )}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Löschen
              </button>
            ) : null}
            <div
              className={cn(
                'flex flex-wrap items-stretch justify-end gap-2',
                selectedRow.kind !== 'closed' && 'w-full'
              )}
            >
              {selectedRow.kind === 'closed' && !selectedRow.archiviert ? (
                <button
                  type="button"
                  disabled={inventurMutateBusy}
                  onClick={() => void handleArchiveInventur()}
                  className={cn(
                    'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-input',
                    'bg-background px-3 text-[12px] font-medium text-foreground',
                    'hover:bg-muted disabled:pointer-events-none disabled:opacity-45',
                    'sm:flex-initial sm:px-3.5'
                  )}
                >
                  <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  Archivieren
                </button>
              ) : null}
              {selectedRow.kind === 'closed' && selectedRow.archiviert ? (
                <button
                  type="button"
                  disabled={inventurMutateBusy}
                  onClick={() => void handleRestoreInventur()}
                  className={cn(
                    'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-input',
                    'bg-background px-3 text-[12px] font-medium text-foreground',
                    'hover:bg-muted disabled:pointer-events-none disabled:opacity-45',
                    'sm:flex-initial sm:px-3.5'
                  )}
                >
                  <History className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  Wiederöffnen
                </button>
              ) : selectedRow.session && currentUser && userCanEndZaehlSession(currentUser, selectedRow.session) ? (
                <button
                  type="button"
                  disabled={Boolean(endingSessionId)}
                  className={cn(
                    'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input',
                    'bg-background px-3.5 text-[12px] font-medium text-foreground hover:bg-muted',
                    'disabled:pointer-events-none disabled:opacity-45'
                  )}
                  onClick={async () => {
                    setRemoteEndMessage('')
                    if (
                      !window.confirm(
                        'Diese Zählsession jetzt beenden? Erfasste Mengen werden wie bei „Fertig“ übernommen.'
                      )
                    ) {
                      return
                    }
                    setEndingSessionId(selectedRow.id)
                    try {
                      const res = await onEndOpenSession?.(selectedRow.id)
                      if (res && res.ok === false && res.message) setRemoteEndMessage(res.message)
                    } finally {
                      setEndingSessionId(null)
                    }
                  }}
                >
                  {endingSessionId === selectedRow.id ? '…' : 'Session beenden'}
                </button>
              ) : null}
              <div className="relative min-w-0 flex-1 sm:flex-initial sm:min-w-[7.5rem]" ref={exportMenuRef}>
                {selectedRow.kind === 'closed' && selectedRow.tableRows.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-9 w-full min-w-0 items-center justify-center gap-1 rounded-md border border-input',
                        'bg-background px-3 text-[12px] font-medium text-foreground hover:bg-muted',
                        'sm:min-w-[7.5rem]'
                      )}
                      aria-expanded={exportMenuOpen}
                      onClick={() => setExportMenuOpen((o) => !o)}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                      <span className="truncate">Export</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    </button>
                    {exportMenuOpen ? (
                      <div
                        className="absolute bottom-full right-0 z-20 mb-1 min-w-[10rem] rounded-md border border-border bg-background py-1 shadow-md"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-muted"
                          onClick={() => {
                            exportRow(selectedRow, exportNr, 'pdf')
                            setExportMenuOpen(false)
                          }}
                        >
                          Als PDF
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-muted"
                          onClick={() => {
                            exportRow(selectedRow, exportNr, 'csv')
                            setExportMenuOpen(false)
                          }}
                        >
                          Als CSV
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : selectedRow.kind === 'closed' ? (
                  <span className="text-[11px] text-muted-foreground">Export nach Abschluss</span>
                ) : null}
              </div>
            </div>
          </footer>
        </>
      )}
    </aside>
  )

  const tableSection =
    !loading && !error ? (
      inventuren.length === 0 && openSessions.length === 0 ? (
        <div className="border border-dashed border-border bg-background px-4 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">Noch keine Inventur</p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Inventuren werden im Zähler-Client gestartet und mit <strong className="font-medium text-foreground">Fertig</strong>{' '}
            abgeschlossen — danach erscheinen sie hier.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="border border-border bg-background px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          Keine Inventuren für die aktuelle Filterkombination.
        </p>
      ) : (
        <div className="w-full min-w-0 bg-background" role="region" aria-label="Inventuren">
          <table className="w-full table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col className="w-[3.25rem]" />
              <col className="w-[13%]" />
              <col />
              <col className="w-[18%]" />
              <col className="w-[3.25rem]" />
              <col className="w-[14%]" />
              <col className="w-9" />
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-background">
                <th
                  scope="col"
                  className="px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Nr.
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Ort
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  title="Abgeschlossen am"
                >
                  Ende
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Pos.
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Summe
                </th>
                <th scope="col" className="w-9 px-1 py-2" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const nr = displayNrForRow(row)
                const active = selectedRowId === row.id
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-border transition-colors',
                      active ? 'bg-muted' : 'bg-background',
                      !active && 'hover:bg-muted/50'
                    )}
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    <td
                      className={cn(
                        'border-l-2 px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground',
                        active ? 'border-l-primary' : 'border-l-transparent'
                      )}
                    >
                      #{nr}
                    </td>
                    <td className="min-w-0 px-2 py-1.5">
                      <StatusPill status={row.status} compact />
                    </td>
                    <td className="min-w-0 px-2 py-1.5 text-muted-foreground">
                      <span className="line-clamp-2 break-words" title={row.lagerDisplay}>
                        {row.lagerDisplay}
                      </span>
                    </td>
                    <td className="min-w-0 px-2 py-1.5 font-mono text-[10px] leading-snug tabular-nums text-muted-foreground">
                      <span className="line-clamp-2 break-words" title={row.ended ? formatDeDateTime(row.ended) : undefined}>
                        {row.ended ? formatDeDateTimeCompact(row.ended) : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-foreground">
                      {row.positionenAnzahl}
                    </td>
                    <td className="min-w-0 px-2 py-1.5 text-right font-mono text-[11px] font-medium tabular-nums text-foreground">
                      <span className="block truncate" title={row.gesamtwert != null ? formatEurIntl(row.gesamtwert) : undefined}>
                        {row.gesamtwert != null ? formatEurIntl(row.gesamtwert) : '—'}
                      </span>
                    </td>
                    <td className="relative px-0.5 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        aria-label="Menü"
                        aria-expanded={menuRowId === row.id}
                        onClick={() => setMenuRowId((id) => (id === row.id ? null : row.id))}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuRowId === row.id ? (
                        <div
                          ref={menuRef}
                          className="absolute right-2 top-9 z-20 min-w-[10rem] rounded-md border border-border bg-background py-1 text-left shadow-md"
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted"
                            onClick={() => {
                              setSelectedRowId(row.id)
                              setMenuRowId(null)
                            }}
                          >
                            Details
                          </button>
                          {row.kind === 'closed' && row.tableRows.length > 0 ? (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted"
                                onClick={() => {
                                  exportRow(row, nr, 'csv')
                                  setMenuRowId(null)
                                }}
                              >
                                Als CSV
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted"
                                onClick={() => {
                                  exportRow(row, nr, 'pdf')
                                  setMenuRowId(null)
                                }}
                              >
                                Als PDF
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    ) : null

  return (
    <div
      className={cn(
        'admin-view admin-page--inventuren inventuren-page--wide magazin-variant-c',
        'flex h-[calc(100vh-3.5rem)] min-h-[480px] w-full min-w-0 flex-col bg-background text-foreground'
      )}
    >
      {loading ? (
        <>
          {feedbackBlock}
          {error ? (
            <p
              className="mx-3 mb-2 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {inventurShellTopBar}
          <p className="px-3 pt-2 text-[12.5px] text-muted-foreground">Lade Inventuren …</p>
        </>
      ) : (
        <>
          {feedbackBlock}
          {error ? (
            <p
              className="mx-3 mb-2 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {inventurShellTopBar}
          <div className="flex min-h-0 min-w-0 flex-1 flex-row">
            <InventurNavSidebar
              statusTab={statusTab}
              onStatusTab={setStatusTab}
              tabCounts={tabCounts}
              kpi={kpi}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
              {inventurListHeader}
              {filterBar}
              {openSessionsLoading ? (
                <p className="shrink-0 border-b border-border px-3 py-1.5 text-[12px] text-muted-foreground">
                  Offene Sessions werden geladen …
                </p>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Inventuren-Liste">
                {tableSection}
              </div>
            </div>
            {detailPanel}
          </div>
        </>
      )}
    </div>
  )
}
