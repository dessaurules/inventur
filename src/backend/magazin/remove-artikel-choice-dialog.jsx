import { useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../../lib/cn.js'

/**
 * Nach „Löschen“: Wahl zwischen Archivieren oder endgültigem Löschen (Einzelauswahl & Mehrfachauswahl).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {number} props.count
 * @param {boolean} props.allowArchive – false z. B. bei bereits archivierten Artikeln
 * @param {boolean} props.allowPermanentDelete – false wenn keine PB-Delete-Rechte/API
 * @param {(mode: 'archive'|'permanent') => Promise<void>} props.onApply
 */
export function RemoveArtikelChoiceDialog({
  open,
  onOpenChange,
  count,
  allowArchive,
  allowPermanentDelete,
  onApply,
}) {
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (mode) => {
      setBusy(true)
      try {
        await onApply(mode)
        onOpenChange(false)
      } finally {
        setBusy(false)
      }
    },
    [onApply, onOpenChange]
  )

  const n = Math.max(0, Number(count) || 0)
  const beideOptionen = allowArchive === true && allowPermanentDelete === true

  let title = 'Artikel entfernen'
  let description = ''
  if (!allowArchive && allowPermanentDelete) {
    title = n === 1 ? 'Artikel endgültig löschen?' : `${n} Artikel endgültig löschen?`
    description =
      'Der Datensatz wird aus PocketBase gelöscht und kann ohne Backup nicht wiederhergestellt werden.'
  } else if (allowArchive && !allowPermanentDelete) {
    title = n === 1 ? 'Artikel archivieren?' : `${n} Artikel archivieren?`
    description =
      n === 1
        ? 'Der Artikel verschwindet aus den aktiven Listen und kann später unter „Archiviert“ wiederhergestellt werden.'
        : `Die ${n} Artikel verschwinden aus den aktiven Listen und können später unter „Archiviert“ wiederhergestellt werden.`
  } else if (beideOptionen) {
    title = n === 1 ? 'Artikel archivieren oder löschen?' : `${n} Artikel archivieren oder löschen?`
    description =
      '„Archivieren“ blendet nur aus und ist später rückgängig machbar. „Endgültig löschen“ entfernt die Datensätze in PocketBase dauerhaft.'
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => {
      if (!busy) onOpenChange(v)
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-1 text-base font-semibold text-foreground">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mb-5 text-[13px] leading-snug text-muted-foreground">
              {description}
            </Dialog.Description>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              Abbrechen
            </button>
            {allowArchive ? (
              <button
                type="button"
                onClick={() => void run('archive')}
                disabled={busy}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Archivieren
              </button>
            ) : null}
            {allowPermanentDelete ? (
              <button
                type="button"
                onClick={() => void run('permanent')}
                disabled={busy}
                className="rounded-md bg-destructive px-3 py-1.5 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Endgültig löschen
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
