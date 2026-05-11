import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { parseArtikelExcelBuffer } from '../../lib/excelArtikelImport'
import { ArticleList } from './article-list.jsx'
import { CommandPalette } from './command-palette.jsx'
import { DetailDrawer } from './detail-drawer.jsx'
import { SidebarCategories } from './sidebar-categories.jsx'
import { isEditableTarget, useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts.js'
import { InvoiceImportDialog } from './invoice-import-dialog.jsx'
import { BulkActionsPanel } from './bulk-actions-panel.jsx'
import { RemoveArtikelChoiceDialog } from './remove-artikel-choice-dialog.jsx'
import { artikelMatchesSmartNoCat, mapItemToMagazinArtikel, normalizeStueckProLiefergebinde } from './types.js'

/**
 * Bestätigungs-Dialog zum Löschen einer Kategorie.
 */
function DeleteCategoryDialog({ name, articleCount, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    await onConfirm()
    setBusy(false)
  }

  return (
    <Dialog.Root open onOpenChange={(v) => { if (!v && !busy) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-1 text-base font-semibold text-foreground">
            Kategorie löschen
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">„{name}"</span>
            {articleCount > 0 ? (
              <>
                {' '}wird bei{' '}
                <span className="font-medium text-foreground">
                  {articleCount} Artikel{articleCount === 1 ? '' : 'n'}
                </span>
                {' '}entfernt. Die Artikel bleiben erhalten, verlieren aber ihre Kategorie-Zuordnung.
              </>
            ) : (
              <> wird gelöscht. Die Kategorie enthält keine Artikel.</>
            )}
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-md bg-destructive px-3 py-1.5 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? 'Wird gelöscht…' : 'Wirklich löschen'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function userLabel(user) {
  if (!user) return ''
  const fn = String(user.firstName ?? '').trim()
  const ln = String(user.lastName ?? '').trim()
  const full = [fn, ln].filter(Boolean).join(' ')
  if (full) return full
  return String(user.email ?? '').trim()
}

/**
 * Basis-URL für Rechnungs-PDF-API (Health + POST).
 * Lokal unter Vite: direkt Express (127.0.0.1 + VITE_API_PORT_HINT), umgeht den /api-Proxy.
 * Überschreibbar: VITE_API_ORIGIN in .env (z. B. http://127.0.0.1:3001).
 */
function expressApiBaseForInvoice() {
  const fromEnv = String(import.meta.env.VITE_API_ORIGIN ?? '')
    .trim()
    .replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (!import.meta.env.DEV) return ''
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return ''
  const p = String(import.meta.env.VITE_API_PORT_HINT ?? '3000').trim() || '3000'
  return `http://127.0.0.1:${p}`
}

function filterAndSort(rows, activeSidebar, query, sort) {
  let list = rows
  if (activeSidebar === '__nocat') {
    list = list.filter(artikelMatchesSmartNoCat)
  } else if (activeSidebar === '__recent') {
    list = [...list]
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .slice(0, 50)
  } else if (activeSidebar === '__archived') {
    // archivierte Artikel werden separat übergeben — hier keine weitere Filterung
  } else if (activeSidebar !== 'all') {
    list = list.filter((a) => a.kategorieId === activeSidebar)
  }
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  if (q) {
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        String(a.artikelnummer).toLowerCase().includes(q) ||
        String(a.nr).includes(q)
    )
  }
  const out = [...list]
  if (sort === 'nr') {
    out.sort((a, b) => a.nr - b.nr || a.name.localeCompare(b.name, 'de'))
  } else if (sort === 'updated') {
    out.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
  } else {
    out.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
  }
  return out
}

/**
 * @param {object} props — gleiche Basis wie AdminView + currentUser
 */
export function MagazinShell({
  categories: categoryNamesIn,
  items,
  archivedItems = [],
  readOnlyMagazin,
  currentUser,
  loadError = '',
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onCreateArtikel,
  onBulkImportArtikel,
  onUpdateArtikel,
  onArchiveArtikel,
  onUnarchiveArtikel,
  onDeleteArtikel,
}) {
  const canMutate = !readOnlyMagazin
  const uLabel = userLabel(currentUser)

  const baseArticles = useMemo(
    () => items.map((it) => mapItemToMagazinArtikel(it, uLabel)),
    [items, uLabel]
  )

  const invoiceLinkArticles = useMemo(
    () =>
      baseArticles.filter((a) => {
        const raw = items.find((it) => it.id === a.id)
        return Boolean(raw && !raw.archived)
      }),
    [baseArticles, items]
  )

  const [activeSidebar, setActiveSidebar] = useState('all')
  const [listQuery, setListQuery] = useState('')
  const [sort, setSort] = useState(/** @type {'name' | 'nr' | 'updated'} */ ('name'))
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [activeArticleId, setActiveArticleId] = useState(/** @type {string | null} */ (null))
  const [commandOpen, setCommandOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState(/** @type {'idle' | 'saving' | 'error'} */ ('idle'))
  const [categoryOrder, setCategoryOrder] = useState(/** @type {string[] | null} */ (null))
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(false)
  const [invoiceImportRows, setInvoiceImportRows] = useState(/** @type {null | object[]} */ (null))
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(/** @type {string | null} */ (null))
  const [invoiceParseWarnings, setInvoiceParseWarnings] = useState(/** @type {string[]} */ ([]))
  const [bulkRemoveDialogOpen, setBulkRemoveDialogOpen] = useState(false)

  useEffect(() => {
    const open = () => setCommandOpen(true)
    window.addEventListener('vibe-magazin-open-command', open)
    return () => window.removeEventListener('vibe-magazin-open-command', open)
  }, [])

  const anchorIndexRef = useRef(-1)
  const excelRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const pdfInvoiceRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const listWrapRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const findRawArticleForLieferantNr = useCallback(
    (nr) => {
      const k = String(nr ?? '').trim()
      if (!k) return null
      return (
        items.find(
          (it) =>
            !it.archived &&
            (String(it.lieferantenArtnr ?? '').trim() === k ||
              String(it.artikelnummer ?? '').trim() === k)
        ) ?? null
      )
    },
    [items]
  )

  const countsByCategory = useMemo(() => {
    const m = Object.create(null)
    for (const a of baseArticles) {
      const k = a.kategorieId || ''
      if (!k) continue
      m[k] = (m[k] ?? 0) + 1
    }
    return m
  }, [baseArticles])

  const archivedArticles = useMemo(
    () => archivedItems.map((it) => mapItemToMagazinArtikel(it, uLabel)),
    [archivedItems, uLabel]
  )

  const smartCounts = useMemo(() => {
    const nocat = baseArticles.filter(artikelMatchesSmartNoCat).length
    const recent = Math.min(
      50,
      [...baseArticles].filter((a) => a.updatedAt).length
    )
    return [nocat, recent, archivedArticles.length]
  }, [baseArticles, archivedArticles])

  const orderedCategoryNames = useMemo(() => {
    const set = new Set(categoryNamesIn)
    const base = [...categoryNamesIn]
    if (categoryOrder?.length) {
      const rest = base.filter((c) => !categoryOrder.includes(c))
      return [...categoryOrder.filter((c) => set.has(c)), ...rest]
    }
    return base
  }, [categoryNamesIn, categoryOrder])

  const filteredRows = useMemo(
    () => filterAndSort(
      activeSidebar === '__archived' ? archivedArticles : baseArticles,
      activeSidebar,
      listQuery,
      sort,
    ),
    [baseArticles, archivedArticles, activeSidebar, listQuery, sort]
  )

  const activeMagazin = useMemo(() => {
    if (activeArticleId === '__new__') {
      return {
        nr: 0,
        id: '__new__',
        artikelnummer: '',
        name: '',
        preis: 0,
        einheit: 'Stk',
        stueckProLiefergebinde: 1,
        lieferantenArtnr: '',
        kategorieId: null,
        updatedAt: null,
        updatedBy: uLabel,
      }
    }
    if (!activeArticleId) return null
    return (
      baseArticles.find((a) => a.id === activeArticleId) ??
      archivedArticles.find((a) => a.id === activeArticleId) ??
      null
    )
  }, [activeArticleId, baseArticles, archivedArticles, uLabel])

  const drawerOpen = Boolean(activeArticleId)

  const scrollArticleIntoView = useCallback((id) => {
    requestAnimationFrame(() => {
      const root = listWrapRef.current
      if (!root) return
      const sid = String(id)
      for (const el of root.querySelectorAll('[data-id]')) {
        if (el.getAttribute('data-id') === sid) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          break
        }
      }
    })
  }, [])

  const onActivate = useCallback(
    (id) => {
      setActiveArticleId(id)
      scrollArticleIntoView(id)
    },
    [scrollArticleIntoView]
  )

  const onSelectRow = useCallback(
    (id, checked, opts) => {
      const { index = -1, shift = false } = opts ?? {}
      if (shift && anchorIndexRef.current >= 0 && index >= 0) {
        const from = Math.min(anchorIndexRef.current, index)
        const to = Math.max(anchorIndexRef.current, index)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i++) {
            const rid = filteredRows[i]?.id
            if (!rid) continue
            if (checked) next.add(rid)
            else next.delete(rid)
          }
          return next
        })
        return
      }
      if (index >= 0) anchorIndexRef.current = index
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
    },
    [filteredRows]
  )

  const onSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = filteredRows.length > 0 && filteredRows.every((r) => prev.has(r.id))
      if (allSelected) return new Set()
      return new Set(filteredRows.map((r) => r.id))
    })
  }, [filteredRows])

  const rawById = useCallback((id) => items.find((x) => x.id === id), [items])

  const patchArticle = useCallback(
    async (patch) => {
      const raw = rawById(patch.id)
      if (!raw) return { ok: false, message: 'Artikel nicht gefunden.' }
      return onUpdateArtikel({
        id: patch.id,
        artikelnummer: patch.artikelnummer,
        name: patch.name,
        preis: patch.preis,
        einheit: patch.einheit,
        category: patch.category,
        lagerId: raw.lagerId ?? '',
        unterlagerId: raw.unterlagerId ?? '',
        stueckProLiefergebinde: patch.stueckProLiefergebinde,
        lieferantenArtnr: patch.lieferantenArtnr,
      })
    },
    [onUpdateArtikel, rawById]
  )

  const createArticle = useCallback(
    async (fields) => {
      const res = await onCreateArtikel({
        artikelnummer: fields.artikelnummer,
        name: fields.name,
        preis: fields.preis,
        einheit: fields.einheit,
        category: fields.category,
        lagerId: '',
        unterlagerId: '',
        stueckProLiefergebinde: fields.stueckProLiefergebinde,
        lieferantenArtnr: fields.lieferantenArtnr,
      })
      if (res?.ok && res.id) {
        setActiveArticleId(res.id)
      }
      return res
    },
    [onCreateArtikel]
  )

  const onCreated = useCallback((id) => {
    setActiveArticleId(id)
  }, [])

  const handleGlobalKeyDown = useCallback(
    (e) => {
      if (isEditableTarget(e.target)) return
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (meta && key === 'k') {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (key === '/' && !meta) {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (key === 'escape') {
        if (commandOpen) setCommandOpen(false)
        else setActiveArticleId(null)
        return
      }
      if (key === 'n' && !meta) {
        e.preventDefault()
        setActiveArticleId('__new__')
        return
      }
      if (key === 'j' || key === 'k') {
        e.preventDefault()
        const idx = filteredRows.findIndex((r) => r.id === activeArticleId)
        const next =
          key === 'j'
            ? idx < filteredRows.length - 1
              ? idx + 1
              : idx
            : idx > 0
              ? idx - 1
              : idx
        if (next >= 0 && filteredRows[next]) {
          onActivate(filteredRows[next].id)
        }
      }
      if (key === 'enter' && activeArticleId) {
        e.preventDefault()
        const el = document.querySelector('[aria-label="Name"]')
        if (el instanceof HTMLElement) el.focus()
      }
    },
    [activeArticleId, commandOpen, filteredRows, onActivate]
  )

  useKeyboardShortcuts(handleGlobalKeyDown)

  const listTitle =
    activeSidebar === 'all'
      ? 'Alle'
      : activeSidebar === '__nocat'
        ? 'Ohne Kategorie'
        : activeSidebar === '__recent'
          ? 'Zuletzt bearbeitet'
          : activeSidebar

  const bulkSetCategory = async (cat) => {
    if (!canMutate) return
    for (const id of selectedIds) {
      const raw = rawById(id)
      if (!raw) continue
      const r = await onUpdateArtikel({
        id,
        artikelnummer: raw.artikelnummer,
        name: raw.name,
        preis: raw.preis,
        einheit: raw.einheit,
        category: cat,
        lagerId: raw.lagerId ?? '',
        unterlagerId: raw.unterlagerId ?? '',
        stueckProLiefergebinde: raw.stueckProLiefergebinde ?? 1,
        lieferantenArtnr: raw.lieferantenArtnr ?? '',
      })
      if (!r?.ok) {
        toast.error(r?.message || 'Kategorie setzen fehlgeschlagen.')
        return
      }
    }
    toast.success('Kategorie aktualisiert.')
    setSelectedIds(new Set())
  }

  const bulkDuplicate = async () => {
    if (!canMutate) return
    for (const id of selectedIds) {
      const raw = rawById(id)
      if (!raw) continue
      const nr = `${String(raw.artikelnummer ?? '').trim()}-KOPIE-${Date.now().toString(36)}`
      const res = await onCreateArtikel({
        artikelnummer: nr.slice(0, 100),
        name: `${raw.name} (Kopie)`,
        preis: raw.preis,
        einheit: raw.einheit || 'Stk',
        category: raw.category ?? '',
        lagerId: raw.lagerId ?? '',
        unterlagerId: raw.unterlagerId ?? '',
        stueckProLiefergebinde: raw.stueckProLiefergebinde ?? 1,
        lieferantenArtnr: raw.lieferantenArtnr ?? '',
      })
      if (!res?.ok) {
        toast.error(res?.message || 'Duplizieren fehlgeschlagen.')
        return
      }
    }
    toast.success('Duplikate angelegt.')
    setSelectedIds(new Set())
  }

  const bulkAllowArchive = Boolean(onArchiveArtikel) && activeSidebar !== '__archived'
  const bulkAllowPermanent = Boolean(onDeleteArtikel)
  const bulkRemoveDisabled = !bulkAllowArchive && !bulkAllowPermanent

  useEffect(() => {
    if (selectedIds.size === 0 && bulkRemoveDialogOpen) setBulkRemoveDialogOpen(false)
  }, [selectedIds.size, bulkRemoveDialogOpen])

  const bulkRemoveSelected = useCallback(
    async (mode) => {
      if (!canMutate) return
      const ids = [...selectedIds]
      for (const id of ids) {
        if (mode === 'archive') {
          if (!onArchiveArtikel) continue
          const r = await onArchiveArtikel(id)
          if (!r?.ok) {
            toast.error(r?.message || 'Archivieren fehlgeschlagen.')
            return
          }
        } else {
          if (!onDeleteArtikel) continue
          const r = await onDeleteArtikel(id)
          if (!r?.ok) {
            toast.error(r?.message || 'Löschen fehlgeschlagen.')
            return
          }
        }
      }
      toast.success(
        mode === 'archive'
          ? ids.length === 1
            ? 'Artikel archiviert.'
            : `${ids.length} Artikel archiviert.`
          : ids.length === 1
            ? 'Artikel endgültig gelöscht.'
            : `${ids.length} Artikel endgültig gelöscht.`
      )
      setSelectedIds(new Set())
    },
    [canMutate, selectedIds, onArchiveArtikel, onDeleteArtikel]
  )

  const bulkRestore = async () => {
    if (!canMutate || !onUnarchiveArtikel) return
    for (const id of selectedIds) {
      const r = await onUnarchiveArtikel(id)
      if (!r?.ok) {
        toast.error(r?.message || 'Wiederherstellen fehlgeschlagen.')
        return
      }
    }
    toast.success('Ausgewählte Artikel wiederhergestellt.')
    setSelectedIds(new Set())
  }

  const handlePdfInvoiceFile = async (event) => {
    const f = event.target.files?.[0]
    event.target.value = ''
    if (!f || !canMutate) return
    const nameOk = f.name?.toLowerCase().endsWith('.pdf')
    const typeOk = f.type === 'application/pdf' || f.type === ''
    if (!nameOk && !typeOk) {
      toast.error('Bitte eine PDF-Datei wählen.')
      return
    }
    try {
      const portHint = import.meta.env.VITE_API_PORT_HINT ?? '3000'
      const apiBase = expressApiBaseForInvoice()
      const healthUrl = `${apiBase ? `${apiBase}/api/health` : '/api/health'}?_${Date.now()}`
      const parseUrl = apiBase ? `${apiBase}/api/magazin/parse-invoice-pdf` : '/api/magazin/parse-invoice-pdf'
      /** @type {Record<string, unknown>} */
      let healthJson = {}
      try {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 4000)
        const h = await fetch(healthUrl, { method: 'GET', cache: 'no-store', signal: ctrl.signal })
        clearTimeout(tid)
        healthJson = (await h.json().catch(() => ({}))) || {}
        if (!h.ok) {
          toast.error(
            `Backend antwortet nicht (HTTP ${h.status}). Express starten: „npm run server“ (Port ${portHint}) oder „npm run dev:full“, dann Vite neu laden.`
          )
          return
        }
        if (healthJson.expressApi !== true) {
          const looksLikePocketBase =
            typeof healthJson.code === 'number' && Object.prototype.hasOwnProperty.call(healthJson, 'data')
          toast.error(
            looksLikePocketBase
              ? `Vite leitet /api zu PocketBase statt zu Express. In .env „VITE_EXPRESS_PORT=${portHint}“ setzen (Port von „npm run server“, oft 3000), Vite neu starten — nicht die PocketBase-URL (8090) als Proxy-Ziel.`
              : `Auf Port ${portHint} läuft kein aktueller Express (ohne expressApi in /api/health). Terminal mit „npm run server“: Ctrl+C, dann im Projektordner „npm run server“ neu — oder „npm run dev:full“.`
          )
          return
        }
      } catch {
        toast.error(
          `Backend nicht erreichbar (Port ${portHint}). „npm run server“ oder „npm run dev:full“ — Vite leitet /api an 127.0.0.1:${portHint} (VITE_EXPRESS_PORT).`
        )
        return
      }

      const buf = await f.arrayBuffer()
      const r = await fetch(parseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: buf,
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        const apiHint =
          r.status === 404
            ? `Rechnungs-API nicht gefunden (HTTP 404). Server mit aktuellem Code neu starten („npm run server“, Port ${portHint}). Bei nur Vite: „npm run dev:full“.`
            : `HTTP ${r.status} — läuft „npm run server“?`
        toast.error(typeof data.error === 'string' ? data.error : apiHint)
        return
      }
      const pdfRows = Array.isArray(data.rows) ? data.rows : []
      const warnings = Array.isArray(data.parseErrors) ? [...data.parseErrors] : []
      const mapped = pdfRows.map((pr) => {
        const match = findRawArticleForLieferantNr(pr.lieferantenArtnr)
        // DB-Wert hat Vorrang; fehlt er (= 1/Standard), nimmt der aus der PDF (NxM-Muster oder FL-Menge)
        const dbStueck = match?.stueckProLiefergebinde
        const stueck = normalizeStueckProLiefergebinde(
          dbStueck && dbStueck > 1 ? dbStueck : (pr.stueckProLiefergebinde ?? 1)
        )
        const newPreis = Math.round((pr.ePreisGebinde / stueck) * 10000) / 10000
        return {
          lieferantenArtnr: pr.lieferantenArtnr,
          bezeichnung: pr.bezeichnung,
          ePreisGebinde: pr.ePreisGebinde,
          match,
          stueckProLiefergebinde: stueck,
          newPreis,
          oldPreis: match?.preis ?? 0,
        }
      })
      if (mapped.length === 0) {
        if (typeof data.rawTextSample === 'string' && data.rawTextSample.trim()) {
          console.warn(
            '[PDF-Import] Kein Treffer. Rohtext (erste 3000 Zeichen):\n' + data.rawTextSample
          )
        }
        const hint =
          typeof data.rawTextSample === 'string' && data.rawTextSample.trim()
            ? ' Rohtext in der Browser-Konsole (F12 → Console) — bitte weiterleiten.'
            : ''
        toast.error('Keine Positionszeilen erkannt — anderes PDF-Layout?' + hint)
        return
      }
      setInvoiceParseWarnings(warnings)
      setInvoiceImportRows(mapped)
      setInvoiceImportOpen(true)
    } catch (err) {
      toast.error(err?.message || 'PDF konnte nicht gelesen werden.')
    }
  }

  const handleExcelFile = async (event) => {
    const f = event.target.files?.[0]
    event.target.value = ''
    if (!f || !onBulkImportArtikel) return
    try {
      const buf = await f.arrayBuffer()
      const parsed = parseArtikelExcelBuffer(buf)
      if (!parsed.ok) {
        toast.error(parsed.error || 'Import nicht möglich.')
        return
      }
      const { created, updated = 0, failed, skipped } = await onBulkImportArtikel(parsed.rows)
      const parts = [`${created} angelegt.`]
      if (updated > 0) parts.push(`${updated} aktualisiert.`)
      if (skipped?.length) parts.push(`${skipped.length} übersprungen.`)
      if (failed?.length) parts.push(`${failed.length} Fehler.`)
      if (failed?.length && created === 0 && updated === 0) {
        toast.error(parts.join(' '))
      } else {
        toast.success(parts.join(' '))
      }
    } catch (err) {
      toast.error(err?.message || 'Excel konnte nicht gelesen werden.')
    }
  }

  const addCategoryPrompt = () => {
    const name = window.prompt('Name der neuen Kategorie')
    if (name && String(name).trim()) onAddCategory(String(name).trim())
  }

  const deleteCategoryPrompt = useCallback(
    (name) => {
      if (!onDeleteCategory) return
      setDeleteCategoryTarget(name)
    },
    [onDeleteCategory]
  )

  const confirmDeleteCategory = useCallback(async () => {
    if (!deleteCategoryTarget || !onDeleteCategory) return
    const name = deleteCategoryTarget
    setDeleteCategoryTarget(null)
    const res = await onDeleteCategory(name)
    if (res?.ok === false) {
      toast.error(res.message || 'Kategorie konnte nicht gelöscht werden.')
    } else {
      toast.success(`Kategorie „${name}" gelöscht.`)
    }
  }, [deleteCategoryTarget, onDeleteCategory])

  const filterBlocksAll =
    Boolean(loadError) === false &&
    baseArticles.length > 0 &&
    filteredRows.length === 0

  return (
    <div className="magazin-variant-c flex h-[calc(100vh-3.5rem)] min-h-[480px] w-full min-w-0 flex-col bg-background text-foreground">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
        <span className="text-sm font-semibold text-foreground">Magazin</span>
      </div>
      {loadError ? (
        <div
          className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}
      {filterBlocksAll ? (
        <div
          className="shrink-0 border-b border-border bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground"
          role="status"
        >
          Keine Artikel in dieser Ansicht — links <strong className="text-foreground">Alle</strong> wählen, die Suche
          leeren oder eine andere Kategorie.
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <SidebarCategories
          categoryNames={orderedCategoryNames}
          countsByCategory={countsByCategory}
          activeSidebar={activeSidebar}
          onSelectSidebar={setActiveSidebar}
          smartCounts={smartCounts}
          onAddCategory={addCategoryPrompt}
          onRenameCategory={(from, to) => {
            void onRenameCategory(from, to)
          }}
          onDeleteCategory={canMutate ? deleteCategoryPrompt : undefined}
          onCategoryOrderChange={setCategoryOrder}
        />
        <div ref={listWrapRef} className="flex min-w-0 flex-1 flex-col">
          <ArticleList
            title={listTitle}
            totalCount={filteredRows.length}
            rows={filteredRows}
            activeId={activeArticleId === '__new__' ? null : activeArticleId}
            selectedIds={selectedIds}
            onActivate={onActivate}
            onSelect={onSelectRow}
            onSelectAll={canMutate ? onSelectAll : undefined}
            query={listQuery}
            onQuery={setListQuery}
            sort={sort}
            onSort={setSort}
            readOnly={!canMutate}
            onNewArticle={() => setActiveArticleId('__new__')}
            onExcelClick={() => excelRef.current?.click()}
            onPdfInvoiceClick={canMutate ? () => pdfInvoiceRef.current?.click() : undefined}
            bulk={{
              count: selectedIds.size,
              kategorieNames: orderedCategoryNames,
              onSetCategory: (c) => void bulkSetCategory(c),
              onDuplicate: () => void bulkDuplicate(),
              onDelete: () => setBulkRemoveDialogOpen(true),
              removeDisabled: bulkRemoveDisabled,
              onClear: () => setSelectedIds(new Set()),
            }}
          />
        </div>
        {selectedIds.size > 0 && canMutate ? (
          <BulkActionsPanel
            count={selectedIds.size}
            kategorieNames={orderedCategoryNames}
            onSetCategory={(c) => bulkSetCategory(c)}
            onDuplicate={() => bulkDuplicate()}
            onBeginRemove={() => setBulkRemoveDialogOpen(true)}
            removeDisabled={bulkRemoveDisabled}
            onRestore={activeSidebar === '__archived' && onUnarchiveArtikel ? () => bulkRestore() : undefined}
            onClear={() => setSelectedIds(new Set())}
          />
        ) : (
          <DetailDrawer
            artikel={activeMagazin}
            open={drawerOpen}
            onClose={() => setActiveArticleId(null)}
            blockEscape={commandOpen}
            readOnly={!canMutate}
            kategorieNames={orderedCategoryNames}
            onPatch={patchArticle}
            onCreate={createArticle}
            onSaveStatus={setSaveStatus}
            saveStatus={saveStatus}
            onErrorToast={(msg) => toast.error(msg)}
            onCreated={onCreated}
            articleRemove={
              canMutate &&
              activeMagazin &&
              activeMagazin.id !== '__new__' &&
              (Boolean(onArchiveArtikel) || Boolean(onDeleteArtikel))
                ? {
                    allowArchive: Boolean(onArchiveArtikel) && !activeMagazin.archived,
                    allowPermanentDelete: Boolean(onDeleteArtikel),
                    execute: async (mode) => {
                      const id = activeMagazin.id
                      if (!id) return
                      if (mode === 'archive') {
                        if (!onArchiveArtikel) return
                        const r = await onArchiveArtikel(id)
                        if (r?.ok) {
                          toast.success('Artikel archiviert.')
                          setActiveArticleId(null)
                        } else toast.error(r?.message || 'Archivieren fehlgeschlagen.')
                        return
                      }
                      if (!onDeleteArtikel) return
                      const r = await onDeleteArtikel(id)
                      if (r?.ok) {
                        toast.success('Artikel endgültig gelöscht.')
                        setActiveArticleId(null)
                      } else toast.error(r?.message || 'Löschen fehlgeschlagen.')
                    },
                  }
                : null
            }
            onRestore={onUnarchiveArtikel ? async () => {
              if (!activeMagazin || activeMagazin.id === '__new__') return
              const r = await onUnarchiveArtikel(activeMagazin.id)
              if (r?.ok) {
                toast.success('Artikel wiederhergestellt.')
                setActiveArticleId(null)
              } else toast.error(r?.message || 'Wiederherstellen fehlgeschlagen.')
            } : undefined}
            onDuplicate={async () => {
              if (!activeMagazin || activeMagazin.id === '__new__') return
              const raw = rawById(activeMagazin.id)
              if (!raw) return
              const nr = `${String(raw.artikelnummer ?? '').trim()}-KOPIE-${Date.now().toString(36)}`
              const res = await onCreateArtikel({
                artikelnummer: nr.slice(0, 100),
                name: `${raw.name} (Kopie)`,
                preis: raw.preis,
                einheit: raw.einheit || 'Stk',
                category: raw.category ?? '',
                lagerId: raw.lagerId ?? '',
                unterlagerId: raw.unterlagerId ?? '',
                stueckProLiefergebinde: raw.stueckProLiefergebinde ?? 1,
                lieferantenArtnr: raw.lieferantenArtnr ?? '',
              })
              if (res?.ok && res.id) {
                toast.success('Duplikat angelegt.')
                setActiveArticleId(res.id)
              } else toast.error(res?.message || 'Duplizieren fehlgeschlagen.')
            }}
          />
        )}
      </div>
      <input
        ref={excelRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleExcelFile}
      />
      <input
        ref={pdfInvoiceRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handlePdfInvoiceFile}
      />
      <InvoiceImportDialog
        open={invoiceImportOpen}
        onOpenChange={(v) => {
          setInvoiceImportOpen(v)
          if (!v) setInvoiceImportRows(null)
        }}
        rows={invoiceImportRows ?? []}
        parseWarnings={invoiceParseWarnings}
        articlesForLink={invoiceLinkArticles}
        onApply={async (payloads) => {
          let ok = 0
          let fail = 0
          let createIdx = 0
          for (const p of payloads) {
            if (p.kind === 'update') {
              const raw = rawById(p.articleId)
              if (!raw) {
                fail += 1
                continue
              }
              const lieferantenArtnr =
                String(p.lieferantenArtnrFromPdf ?? '').trim() || String(raw.lieferantenArtnr ?? '').trim()
              const res = await onUpdateArtikel({
                id: p.articleId,
                artikelnummer: raw.artikelnummer,
                name: raw.name,
                preis: p.preis,
                einheit: raw.einheit || 'Stk',
                category: raw.category ?? '',
                lagerId: raw.lagerId ?? '',
                unterlagerId: raw.unterlagerId ?? '',
                stueckProLiefergebinde: p.stueckProLiefergebinde,
                lieferantenArtnr,
              })
              if (res?.ok) ok += 1
              else fail += 1
            } else {
              createIdx += 1
              const lief = String(p.lieferantenArtnr ?? '').trim()
              const artNr = lief || `IMPORT-${Date.now().toString(36)}-${createIdx}`
              const res = await onCreateArtikel(
                {
                  artikelnummer: artNr.slice(0, 100),
                  name: p.name,
                  preis: p.preis,
                  einheit: 'Stk',
                  category: '',
                  lagerId: '',
                  unterlagerId: '',
                  stueckProLiefergebinde: p.stueckProLiefergebinde,
                  lieferantenArtnr: lief,
                },
                { skipDuplicateConfirm: true }
              )
              if (res?.ok) ok += 1
              else fail += 1
            }
          }
          const parts = []
          if (ok) parts.push(`${ok} übernommen`)
          if (fail) parts.push(`${fail} fehlgeschlagen`)
          if (fail === 0) toast.success(parts.join(' — ') || 'Fertig.')
          else toast.error(parts.join(' — '))
        }}
      />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        articles={baseArticles}
        categories={orderedCategoryNames}
        onSelectArticle={(id) => onActivate(id)}
        onSelectCategory={(c) => {
          setActiveSidebar(c)
          setCommandOpen(false)
        }}
        onNewArticle={() => setActiveArticleId('__new__')}
        onExcelImport={() => excelRef.current?.click()}
        onExport={() => toast.message('Export ist noch nicht angebunden.')}
      />
      <RemoveArtikelChoiceDialog
        open={bulkRemoveDialogOpen && canMutate && selectedIds.size > 0}
        onOpenChange={setBulkRemoveDialogOpen}
        count={selectedIds.size}
        allowArchive={bulkAllowArchive}
        allowPermanentDelete={bulkAllowPermanent}
        onApply={async (mode) => {
          await bulkRemoveSelected(mode)
        }}
      />
      {deleteCategoryTarget && (
        <DeleteCategoryDialog
          name={deleteCategoryTarget}
          articleCount={items.filter((it) => String(it.category ?? '').trim() === deleteCategoryTarget).length}
          onConfirm={confirmDeleteCategory}
          onCancel={() => setDeleteCategoryTarget(null)}
        />
      )}
    </div>
  )
}
