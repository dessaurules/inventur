import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveRestore, Copy, History, Trash2, X } from 'lucide-react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { DetailDrawerForm } from './detail-drawer-form.jsx'
import { ArtikelPreisHistorie } from './artikel-preis-historie.jsx'
import { RemoveArtikelChoiceDialog } from './remove-artikel-choice-dialog.jsx'
import { cn } from '../../lib/cn.js'

/** Neu laden der Preishistorie nach Speichern (updatedAt allein reicht nicht zuverlässig). */
/** @param {import('./types.js').MagazinArtikel | null} a */
function preisHistorieReloadKey(a) {
  if (!a || a.id === '__new__') return '0'
  const u = a.updatedAt
  let t = 0
  if (u instanceof Date && !Number.isNaN(u.getTime())) t = u.getTime()
  else if (u != null) {
    const d = new Date(u)
    if (!Number.isNaN(d.getTime())) t = d.getTime()
  }
  const p = Number(a.preis)
  const safeP = Number.isFinite(p) ? p : 0
  return `${t}-${safeP}`
}

/**
 * @param {object} props
 * @param {import('./types.js').MagazinArtikel | null} props.artikel
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {boolean} props.readOnly
 * @param {string[]} props.kategorieNames
 * @param {(patch: object) => Promise<{ ok: boolean, message?: string }>} props.onPatch
 * @param {(fields: object) => Promise<{ ok: boolean, message?: string, id?: string }>} [props.onCreate]
 * @param {(status: 'idle' | 'saving' | 'error') => void} props.onSaveStatus
 * @param {'idle' | 'saving' | 'error'} props.saveStatus
 * @param {(msg: string) => void} [props.onErrorToast]
 * @param {(id: string) => void} [props.onCreated]
 * @param {null | { allowArchive: boolean, allowPermanentDelete: boolean, execute: (mode: 'archive'|'permanent') => Promise<void> }} [props.articleRemove]
 * @param {() => void} [props.onRestore]
 * @param {() => void} props.onDuplicate
 * @param {boolean} [props.blockEscape] — z. B. solange die Befehlspalette offen ist (Esc nur dort)
 */
export function DetailDrawer({
  artikel,
  open,
  onClose,
  blockEscape = false,
  readOnly,
  kategorieNames,
  onPatch,
  onCreate,
  onSaveStatus,
  saveStatus,
  onErrorToast,
  onCreated,
  articleRemove,
  onRestore,
  onDuplicate,
}) {
  const formRef = useRef(/** @type {{ save: () => Promise<void> } | null} */ (null))
  const isDraft = artikel?.id === '__new__'
  const [draftCanSubmit, setDraftCanSubmit] = useState(false)
  const [removeChoiceOpen, setRemoveChoiceOpen] = useState(false)

  const handleSave = useCallback(() => {
    void formRef.current?.save()
  }, [])

  useEffect(() => {
    if (!open || blockEscape) return undefined
    const onKey = (ev) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, blockEscape])

  const canShowRemove =
    Boolean(articleRemove) &&
    (articleRemove.allowArchive === true || articleRemove.allowPermanentDelete === true)

  return (
    <aside
      className={cn(
        'flex w-[380px] shrink-0 flex-col border-l border-border bg-background',
        'max-[1180px]:fixed max-[1180px]:inset-y-0 max-[1180px]:right-0 max-[1180px]:z-40 max-[1180px]:shadow-xl',
        !open && 'max-[1180px]:hidden'
      )}
      aria-hidden={!open}
      aria-label="Artikeldetails"
    >
      <header className="flex items-start gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {artikel ? `#${artikel.artikelnummer || artikel.nr}` : '—'}
          </p>
          <h3 className="truncate text-sm font-semibold text-foreground">{artikel?.name || 'Neuer Artikel'}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full max-h-[calc(100vh-12rem)]">
          <div className="space-y-4 p-3">
            <div aria-live="polite" className="text-[12px]">
              {isDraft ? (
                <span className="italic text-muted-foreground">Entwurf – nicht gespeichert</span>
              ) : saveStatus === 'saving' ? (
                <span className="text-muted-foreground">Speichert…</span>
              ) : saveStatus === 'error' ? (
                <span className="text-destructive">Fehler – bitte erneut versuchen</span>
              ) : (
                <span className="text-muted-foreground">● Alle Änderungen gespeichert</span>
              )}
            </div>
            <DetailDrawerForm
              ref={formRef}
              key={artikel?.id ?? 'none'}
              artikel={artikel}
              readOnly={readOnly}
              kategorieNames={kategorieNames}
              onPatch={onPatch}
              onCreate={onCreate}
              onSaveStatus={onSaveStatus}
              onErrorToast={onErrorToast}
              onCreated={onCreated}
              onDraftValidityChange={isDraft ? setDraftCanSubmit : undefined}
            />
            <section aria-label="Preisverlauf">
              <ArtikelPreisHistorie
                artikelId={artikel?.id}
                reloadKey={preisHistorieReloadKey(artikel)}
              />
            </section>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none bg-muted/40 p-0.5">
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRemoveChoiceOpen(true)}
            disabled={readOnly || !artikel || artikel.id === '__new__' || !canShowRemove}
            className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-1.5 text-[12.5px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </button>
          {artikel?.archived && onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-1.5 text-[12.5px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Wiederherstellen
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={readOnly || !artikel || artikel.id === '__new__'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted disabled:opacity-50"
            title="Duplizieren"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled
            className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-muted-foreground opacity-50"
            title="Verlauf"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={readOnly || !artikel || (isDraft && !draftCanSubmit)}
            className={cn(
              'inline-flex h-8 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground',
              'hover:opacity-90 disabled:opacity-50'
            )}
          >
            {isDraft ? 'Anlegen' : 'Speichern'}
          </button>
        </div>
      </footer>
      {articleRemove && canShowRemove ? (
        <RemoveArtikelChoiceDialog
          open={removeChoiceOpen}
          onOpenChange={setRemoveChoiceOpen}
          count={1}
          allowArchive={articleRemove.allowArchive}
          allowPermanentDelete={articleRemove.allowPermanentDelete}
          onApply={articleRemove.execute}
        />
      ) : null}
    </aside>
  )
}
