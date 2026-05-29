import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn.js'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {'open' | 'closed'} [props.kind]
 * @param {boolean} props.busy
 * @param {() => void | Promise<void>} props.onConfirm
 */
export function InventurDeleteConfirmDialog({ open, onOpenChange, kind, busy, onConfirm }) {
  const isRunning = kind === 'open'
  const title = isRunning ? 'Zählsession löschen?' : 'Inventur löschen?'
  const description = isRunning
    ? 'Die laufende Session und alle erfassten Positionen werden unwiderruflich entfernt. Dieser Vorgang kann nicht rückgängig gemacht werden.'
    : 'Session und zugehörige Archiv-Einträge werden unwiderruflich entfernt. Dieser Vorgang kann nicht rückgängig gemacht werden.'

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[210] w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-snug text-muted-foreground">
            {description}
          </Dialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onConfirm()}
              className="rounded-md bg-destructive px-3 py-1.5 text-[13px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? 'Löscht…' : 'Löschen'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
