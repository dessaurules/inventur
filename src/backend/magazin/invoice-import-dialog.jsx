import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/cn.js'
import { formatPreisEUR } from './format.js'
import { normalizeStueckProLiefergebinde } from './types.js'

/** @typedef {'all' | 'matched' | 'unmatched' | 'changed'} InvoiceTab */

/**
 * @typedef {object} InvoiceApplyUpdate
 * @property {'update'} kind
 * @property {string} articleId
 * @property {number} preis
 * @property {number} stueckProLiefergebinde
 * @property {string} lieferantenArtnrFromPdf
 */

/**
 * @typedef {object} InvoiceApplyCreate
 * @property {'create'} kind
 * @property {string} name
 * @property {number} preis
 * @property {number} stueckProLiefergebinde
 * @property {string} lieferantenArtnr
 */

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(v: boolean) => void} props.onOpenChange
 * @param {object[]} props.rows
 * @param {string[]} props.parseWarnings
 * @param {import('./types.js').MagazinArtikel[]} props.articlesForLink
 * @param {(payloads: (InvoiceApplyUpdate | InvoiceApplyCreate)[]) => Promise<{ ok: number, fail: number }>} props.onApply
 */
export function InvoiceImportDialog({ open, onOpenChange, rows, parseWarnings, articlesForLink, onApply }) {
  const recognizedToastShownRef = useRef(false)
  /** @type {InvoiceTab} */
  const [tab, setTab] = useState(/** @type {InvoiceTab} */ ('all'))
  /** @type {Record<string, { preis: number, stueck: number }>} */
  const [draftByKey, setDraftByKey] = useState({})
  /** @type {Record<string, boolean>} */
  const [selected, setSelected] = useState({})
  /** @type {Record<string, { action: 'skip' | 'link' | 'create', linkedId: string }>} */
  const [unmatchedByKey, setUnmatchedByKey] = useState({})
  const [linkFilter, setLinkFilter] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      recognizedToastShownRef.current = false
      return
    }
    if (rows.length > 0 && !recognizedToastShownRef.current) {
      recognizedToastShownRef.current = true
      toast.success(`${rows.length} Positionen erkannt`)
    }
    const drafts = {}
    const sel = {}
    const um = {}
    for (const r of rows) {
      const k = rowKey(r)
      const st = normalizeStueckProLiefergebinde(r.stueckProLiefergebinde)
      drafts[k] = { preis: r.newPreis, stueck: st }
      sel[k] = Boolean(r.match)
      um[k] = { action: 'skip', linkedId: '' }
    }
    setDraftByKey(drafts)
    setSelected(sel)
    setUnmatchedByKey(um)
    setTab('all')
    setLinkFilter('')
  }, [open, rows])

  const sortedLinkArticles = useMemo(() => {
    return [...articlesForLink].sort((a, b) =>
      a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
    )
  }, [articlesForLink])

  const filteredLinkArticles = useMemo(() => {
    const q = linkFilter.trim().toLowerCase()
    if (!q) return sortedLinkArticles.slice(0, 250)
    const hit = sortedLinkArticles.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        String(a.artikelnummer).toLowerCase().includes(q) ||
        String(a.lieferantenArtnr ?? '')
          .toLowerCase()
          .includes(q)
    )
    return hit.slice(0, 250)
  }, [sortedLinkArticles, linkFilter])

  const counts = useMemo(() => {
    const matched = rows.filter((r) => r.match).length
    const unmatched = rows.length - matched
    let changed = 0
    for (const r of rows) {
      if (!r.match) continue
      const k = rowKey(r)
      const d = draftByKey[k]
      if (!d) continue
      const oldP = Number(r.oldPreis ?? 0)
      if (Math.abs(d.preis - oldP) > 0.00005) changed += 1
    }
    return { all: rows.length, matched, unmatched, changed }
  }, [rows, draftByKey])

  const visibleRows = useMemo(() => {
    if (tab === 'all') return rows
    if (tab === 'matched') return rows.filter((r) => r.match)
    if (tab === 'unmatched') return rows.filter((r) => !r.match)
    return rows.filter((r) => {
      if (!r.match) return false
      const k = rowKey(r)
      const d = draftByKey[k]
      if (!d) return false
      const oldP = Number(r.oldPreis ?? 0)
      return Math.abs(d.preis - oldP) > 0.00005
    })
  }, [rows, tab, draftByKey])

  const toggle = useCallback((key) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const setDraftPreis = useCallback((key, raw) => {
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) return
    setDraftByKey((prev) => ({
      ...prev,
      [key]: { ...prev[key], preis: Math.round(v * 10000) / 10000 },
    }))
  }, [])

  const setDraftStueck = useCallback((key, raw, ePreisGebinde) => {
    const n = normalizeStueckProLiefergebinde(raw)
    const preis = Math.round((ePreisGebinde / n) * 10000) / 10000
    setDraftByKey((prev) => ({
      ...prev,
      [key]: { preis, stueck: n },
    }))
  }, [])

  const setUnmatchedAction = useCallback((key, action) => {
    setUnmatchedByKey((prev) => ({
      ...prev,
      [key]: { action, linkedId: action === 'link' ? prev[key]?.linkedId ?? '' : '' },
    }))
    if (action === 'skip' || action === 'create') {
      setSelected((s) => ({ ...s, [key]: false }))
    }
  }, [])

  const setLinkedId = useCallback((key, linkedId) => {
    setUnmatchedByKey((prev) => ({ ...prev, [key]: { ...prev[key], action: 'link', linkedId } }))
    if (linkedId) setSelected((s) => ({ ...s, [key]: true }))
  }, [])

  const articleOptionsForSelect = useCallback(
    (linkedId) => {
      const selArt = linkedId ? sortedLinkArticles.find((a) => a.id === linkedId) : null
      const list = filteredLinkArticles
      if (selArt && !list.some((a) => a.id === linkedId)) return [selArt, ...list]
      return list
    },
    [filteredLinkArticles, sortedLinkArticles]
  )

  const buildPayloads = useCallback(() => {
    /** @type {(InvoiceApplyUpdate | InvoiceApplyCreate)[]} */
    const out = []
    for (const r of rows) {
      const k = rowKey(r)
      if (!selected[k]) continue
      const draft = draftByKey[k]
      if (!draft) continue
      const liefPdf = String(r.lieferantenArtnr ?? '').trim()

      if (r.match) {
        out.push({
          kind: 'update',
          articleId: r.match.id,
          preis: draft.preis,
          stueckProLiefergebinde: draft.stueck,
          lieferantenArtnrFromPdf: liefPdf,
        })
        continue
      }

      const u = unmatchedByKey[k] ?? { action: 'skip', linkedId: '' }
      if (u.action === 'link' && u.linkedId) {
        out.push({
          kind: 'update',
          articleId: u.linkedId,
          preis: draft.preis,
          stueckProLiefergebinde: draft.stueck,
          lieferantenArtnrFromPdf: liefPdf,
        })
      } else if (u.action === 'create') {
        const name = String(r.bezeichnung ?? '').trim()
        if (!name) continue
        out.push({
          kind: 'create',
          name,
          preis: draft.preis,
          stueckProLiefergebinde: draft.stueck,
          lieferantenArtnr: liefPdf,
        })
      }
    }
    return out
  }, [rows, selected, draftByKey, unmatchedByKey])

  const payloadsPreview = useMemo(() => buildPayloads(), [buildPayloads])
  const nUpdates = payloadsPreview.filter((p) => p.kind === 'update').length
  const nCreates = payloadsPreview.filter((p) => p.kind === 'create').length

  const handleApply = async () => {
    const payloads = buildPayloads()
    if (payloads.length === 0) return
    setBusy(true)
    try {
      const { ok, fail } = await onApply(payloads)
      if (fail > 0) {
        toast.error(
          fail === 1
            ? '1 Position konnte nicht gespeichert werden'
            : `${fail} Positionen konnten nicht gespeichert werden`
        )
      } else if (ok > 0) {
        toast.success('Preise erfolgreich übernommen')
      }
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  /** @param {InvoiceTab} t */
  function TabBtn({ t, label, count }) {
    const active = tab === t
    return (
      <button
        type="button"
        onClick={() => setTab(t)}
        className={cn(
          'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
          active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        {label}
        <span className="ml-1 tabular-nums text-[11px] opacity-80">({count})</span>
      </button>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,800px)] w-[min(96vw,960px)] -translate-x-1/2 -translate-y-1/2',
            'flex flex-col rounded-lg border border-border bg-background shadow-lg outline-none'
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-semibold text-foreground">Preise aus Rechnung (PDF)</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-muted-foreground">
                E-Preis ÷ Gebinde = Einzelpreis. Preise und Faktor anpassbar. Ohne Treffer: zuordnen, neu anlegen oder
                überspringen — nur angehakte Zeilen werden übernommen.
              </Dialog.Description>
            </div>
            <Dialog.Close
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {parseWarnings?.length ? (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-950 dark:text-amber-100">
              {parseWarnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            <TabBtn t="all" label="Alle" count={counts.all} />
            <TabBtn t="matched" label="Mit Treffer" count={counts.matched} />
            <TabBtn t="unmatched" label="Ohne Treffer" count={counts.unmatched} />
            <TabBtn t="changed" label="Preis geändert" count={counts.changed} />
          </div>
          {counts.unmatched > 0 && tab === 'unmatched' ? (
            <div className="border-b border-border px-3 py-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Artikel filtern (Zuordnung)
              </label>
              <input
                type="search"
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
                placeholder="Name, Artikelnr., Lief.-Nr. …"
                className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <table className="w-full min-w-[720px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2 pr-2" />
                  <th className="py-2 pr-2">Lief.-Nr.</th>
                  <th className="py-2 pr-2">Bezeichnung (PDF)</th>
                  <th className="min-w-[120px] py-2 pr-2">Artikel</th>
                  <th className="py-2 pr-2 text-right">E-Preis</th>
                  <th className="w-16 py-2 pr-2 text-right">÷</th>
                  <th className="w-24 py-2 pr-2 text-right">Neu €</th>
                  <th className="py-2 pr-2 text-right">Alt</th>
                  <th className="min-w-[140px] py-2">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const k = rowKey(r)
                  const hasMatch = Boolean(r.match)
                  const draft = draftByKey[k] ?? { preis: r.newPreis, stueck: r.stueckProLiefergebinde }
                  const u = unmatchedByKey[k] ?? { action: 'skip', linkedId: '' }
                  const canSelect =
                    hasMatch ||
                    (u.action === 'link' && Boolean(u.linkedId)) ||
                    (u.action === 'create' && String(r.bezeichnung ?? '').trim().length > 0)
                  const opts = articleOptionsForSelect(u.linkedId)
                  return (
                    <tr
                      key={k}
                      className={cn(
                        'border-b border-border/80',
                        !hasMatch && u.action === 'skip' && 'bg-muted/20'
                      )}
                    >
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[k])}
                          disabled={!canSelect || busy}
                          onChange={() => toggle(k)}
                          aria-label={`Übernehmen ${r.lieferantenArtnr}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums">{r.lieferantenArtnr}</td>
                      <td className="max-w-[200px] truncate py-1.5 pr-2" title={r.bezeichnung}>
                        {r.bezeichnung}
                      </td>
                      <td className="max-w-[160px] truncate py-1.5 pr-2 text-muted-foreground" title={hasMatch ? r.match.name : ''}>
                        {hasMatch ? r.match.name : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatPreisEUR(r.ePreisGebinde)}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          disabled={busy}
                          value={draft.stueck}
                          onChange={(e) => setDraftStueck(k, e.target.value, r.ePreisGebinde)}
                          className="w-full rounded border border-border bg-background px-1 py-0.5 text-right text-[12px] tabular-nums"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          disabled={busy}
                          value={Number.isFinite(draft.preis) ? draft.preis : ''}
                          onChange={(e) => setDraftPreis(k, e.target.value)}
                          className="w-full rounded border border-border bg-background px-1 py-0.5 text-right text-[12px] font-medium tabular-nums"
                        />
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {hasMatch ? formatPreisEUR(r.oldPreis ?? 0) : '—'}
                      </td>
                      <td className="py-1.5">
                        {hasMatch ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex min-w-0 flex-col gap-1">
                            <select
                              disabled={busy}
                              value={u.action}
                              onChange={(e) =>
                                setUnmatchedAction(k, /** @type {'skip' | 'link' | 'create'} */ (e.target.value))
                              }
                              className="max-w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                            >
                              <option value="skip">Überspringen</option>
                              <option value="link">Bestehend zuordnen</option>
                              <option value="create">Neu anlegen</option>
                            </select>
                            {u.action === 'link' ? (
                              <select
                                disabled={busy}
                                value={u.linkedId}
                                onChange={(e) => setLinkedId(k, e.target.value)}
                                className="max-w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                              >
                                <option value="">— Artikel wählen —</option>
                                {opts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.artikelnummer || a.id.slice(0, 8)})
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <p className="text-[12px] text-muted-foreground">
              Übernehmen:{' '}
              <span className="font-medium text-foreground">
                {nUpdates} Aktualisierung{nUpdates === 1 ? '' : 'en'}
              </span>
              {nCreates > 0 ? (
                <>
                  {' · '}
                  <span className="font-medium text-foreground">
                    {nCreates} neu{nCreates === 1 ? '' : 'e'}
                  </span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] hover:bg-muted"
                  disabled={busy}
                >
                  Abbrechen
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={busy || payloadsPreview.length === 0}
                onClick={() => void handleApply()}
                className={cn(
                  'rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground',
                  'hover:opacity-90 disabled:opacity-50'
                )}
              >
                {busy ? 'Speichert…' : `${payloadsPreview.length} übernehmen`}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** @param {{ lieferantenArtnr: string }} r */
function rowKey(r) {
  return String(r.lieferantenArtnr ?? '').trim()
}
