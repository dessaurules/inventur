import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Copy, Tag, Trash2, X } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * Rechtes Panel für Mehrfachauswahl – gleiche Struktur wie DetailDrawer.
 *
 * @param {object} props
 * @param {number} props.count
 * @param {string[]} props.kategorieNames
 * @param {(cat: string) => Promise<void>} props.onSetCategory
 * @param {() => Promise<void>} props.onDuplicate
 * @param {() => Promise<void>} props.onDelete
 * @param {() => void} props.onClear
 */
export function BulkActionsPanel({ count, kategorieNames, onSetCategory, onDuplicate, onDelete, onClear }) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [duplicateBusy, setDuplicateBusy] = useState(false)

  const handleDelete = async () => {
    setDeleteBusy(true)
    await onDelete()
    setDeleteBusy(false)
    setDeleteOpen(false)
  }

  const handleSetCategory = async (cat) => {
    setCategoryBusy(true)
    await onSetCategory(cat)
    setCategoryBusy(false)
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

          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none bg-muted/40 p-0.5">
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      {/* Footer – gleich wie DetailDrawer */}
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-transparent px-2 py-1.5 text-[12.5px] text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Archivieren
        </button>
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

      {/* Bestätigungs-Dialog Archivieren */}
      {deleteOpen && (
        <Dialog.Root open onOpenChange={(v) => { if (!v && !deleteBusy) setDeleteOpen(false) }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Dialog.Title className="mb-1 text-base font-semibold text-foreground">
                Artikel archivieren
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {count} {count === 1 ? 'Artikel wird' : 'Artikel werden'}
                </span>{' '}
                archiviert und aus der Liste entfernt.
              </Dialog.Description>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleteBusy}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteBusy}
                  className="rounded-md bg-destructive px-3 py-1.5 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteBusy ? 'Wird archiviert…' : 'Wirklich archivieren'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </aside>
  )
}
