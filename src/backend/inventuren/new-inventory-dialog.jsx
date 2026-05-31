import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { LAGER_OPTIONS } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.tenantId - Current user's tenant
 * @param {Array} props.verantwortliche - List of Schichtleiter/Admins
 * @param {() => Promise<void>} props.onInventoryCreated - Callback nach Erstellung
 */
export function NewInventoryDialog({ open, onOpenChange, tenantId, verantwortliche = [], onInventoryCreated }) {
  const [name, setName] = useState('')
  const [lager, setLager] = useState('küche')
  const [verantwortlicher, setVerantwortlicher] = useState('')
  const [notizen, setNotizen] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Name erforderlich')
      return
    }
    if (!lager) {
      toast.error('Lager erforderlich')
      return
    }
    if (!verantwortlicher) {
      toast.error('Verantwortlicher erforderlich')
      return
    }

    setLoading(true)
    try {
      await pb.collection(PB_COLLECTIONS.zaehlSessions).create({
        name: trimmedName,
        lager: lager,
        session_owner: verantwortlicher,
        standort: tenantId,
        status: 'vorbereitung',
        notizen: notizen.trim(),
      })
      toast.success('Inventur erstellt')
      setName('')
      setLager('küche')
      setVerantwortlicher('')
      setNotizen('')
      onOpenChange(false)
      await onInventoryCreated()
    } catch (err) {
      toast.error('Inventur konnte nicht erstellt werden')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-4 text-base font-semibold text-foreground">
            Neue Inventur erstellen
          </Dialog.Title>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Name / Titel
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Inventur Mai 2026"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Lager
            </label>
            <select
              value={lager}
              onChange={(e) => setLager(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            >
              {Object.values(LAGER_OPTIONS)
                .filter((l) => l.key !== 'alle')
                .map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Verantwortlicher
            </label>
            <select
              value={verantwortlicher}
              onChange={(e) => setVerantwortlicher(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            >
              <option value="">-- Wähle einen Schichtleiter --</option>
              {verantwortliche.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Notizen (optional)
            </label>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              placeholder="Zusätzliche Notizen..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
                disabled={loading}
              >
                Abbrechen
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Wird erstellt…' : 'Erstellen'}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
