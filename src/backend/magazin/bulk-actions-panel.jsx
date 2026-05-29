import { useState } from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { ArchiveRestore, Copy, Tag, Trash2, X } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * Rechtes Panel für Mehrfachauswahl – gleiche Struktur wie DetailDrawer.
 *
 * @param {object} props
 * @param {number} props.count
 * @param {string[]} props.kategorieNames
 * @param {Array<{id:string,name:string}>} [props.lagerList]
 * @param {(cat: string) => Promise<void>} props.onSetCategory
 * @param {(lag: string) => Promise<void>} [props.onSetLager]
 * @param {() => Promise<void>} props.onDuplicate
 * @param {() => void} props.onBeginRemove – öffnet Dialog (Archivieren / endgültig löschen) am Parent
 * @param {() => Promise<void>} [props.onRestore]
 * @param {() => void} props.onClear
 * @param {boolean} [props.removeDisabled] – z. B. wenn weder Archivieren noch Löschen möglich
 */
export function BulkActionsPanel({
  count,
  kategorieNames,
  lagerList = [],
  onSetCategory,
  onSetLager,
  onDuplicate,
  onBeginRemove,
  onRestore,
  onClear,
  removeDisabled,
}) {
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [lagerBusy, setLagerBusy] = useState(false)
  const [duplicateBusy, setDuplicateBusy] = useState(false)

  const handleSetCategory = async (cat) => {
    setCategoryBusy(true)
    await onSetCategory(cat)
    setCategoryBusy(false)
  }

  const handleSetLager = async (lag) => {
    if (!onSetLager) return
    setLagerBusy(true)
    await onSetLager(lag)
    setLagerBusy(false)
  }

  const handleRestore = async () => {
    setRestoreBusy(true)
    await onRestore?.()
    setRestoreBusy(false)
  }

  const handleDuplicate = async () => {
    setDuplicateBusy(true)
    await onDuplicate()
    setDuplicateBusy(false)
  }

  return (
    <aside
      className={cn(
        'flex w-[380px] shrink-0 flex-col border-l border-border bg-background',
        'max-[1180px]:fixed max-[1180px]:inset-y-0 max-[1180px]:right-0 max-[1180px]:z-40 max-[1180px]:shadow-xl'
      )}
      aria-label="Massenaktionen"
    >
      {/* Header – gleich wie DetailDrawer */}
      <header className="flex items-start gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {count} Artikel ausgewählt
          </p>
          <h3 className="truncate text-sm font-semibold text-foreground">Mehrfachauswahl</h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Auswahl aufheben"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollbarer Inhalt */}
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport className="h-full max-h-[calc(100vh-12rem)]">
          <div className="space-y-4 p-3">

            {/* Kategorie zuweisen */}
            <section aria-label="Kategorie zuweisen">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Tag className="h-3 w-3" />
                Kategorie zuweisen
              </p>
              {kategorieNames.length === 0 ? (
                <p className="rounded-md border border-border px-3 py-2 text-[12.5px] text-muted-foreground">
                  Keine Kategorien vorhanden
                </p>
              ) : (
                <ul className="rounded-md border border-border">
                  {kategorieNames.map((cat, i) => (
                    <li key={cat}>
                      <button
                        type="button"
                        onClick={() => handleSetCategory(cat)}
                        disabled={categoryBusy}
                        className={cn(
                          'w-full px-3 py-2 text-left text-[12.5px] text-foreground hover:bg-muted disabled:opacity-50',
                          i < kategorieNames.length - 1 && 'border-b border-border'
                        )}
                      >
                        {cat}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Lager zuweisen */}
            {lagerList.length > 1 && (
              <section aria-label="Lager zuweisen">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  Lager zuweisen
                </p>
                <ul className="rounded-md border border-border">
                  {lagerList.map((lag, i) => (
                    <li key={lag.id}>
                      <button
                        type="button"
                        onClick={() => handleSetLager(lag.id)}
                        disabled={lagerBusy}
                        className={cn(
                          'w-full px-3 py-2 text-left text-[12.5px] text-foreground hover:bg-muted disabled:opacity-50',
                          i < lagerList.length - 1 && 'border-b border-border'
                        )}
                      >
                        {lag.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none bg-muted/40 p-0.5">
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      {/* Footer – gleich wie DetailDrawer */}
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onBeginRemove?.()}
            disabled={removeDisabled}
            className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-1.5 text-[12.5px] text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </button>
          {onRestore && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoreBusy}
              className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-1.5 text-[12.5px] text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/40"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              {restoreBusy ? 'Wird wiederhergestellt…' : 'Wiederherstellen'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={duplicateBusy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 text-muted-foreground hover:bg-muted disabled:opacity-50"
            title="Duplizieren"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </aside>
  )
}
