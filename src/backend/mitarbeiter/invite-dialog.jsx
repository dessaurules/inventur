import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { ROLES } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

export function InviteDialog({ open, onOpenChange, tenantId, onInviteSent }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('inventur')
  const [assignLager, setAssignLager] = useState(false)
  const [selectedLager, setSelectedLager] = useState(new Set())
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      toast.error('E-Mail erforderlich')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Ungültige E-Mail-Adresse')
      return
    }

    setLoading(true)
    try {
      await pb.collection(PB_COLLECTIONS.userInvites).create({
        email: trimmedEmail,
        role: role,
        tenant_id: tenantId,
        assigned_lager: assignLager ? Array.from(selectedLager) : [],
      })
      toast.success(`Einladung gesendet an ${trimmedEmail}`)
      setEmail('')
      setRole('inventur')
      setAssignLager(false)
      setSelectedLager(new Set())
      onOpenChange(false)
      await onInviteSent()
    } catch (err) {
      if (err.message?.includes('duplicate')) {
        toast.error('Mitarbeiter existiert bereits')
      } else {
        toast.error('Einladung konnte nicht gesendet werden')
      }
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
            Mitarbeiter einladen
          </Dialog.Title>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="max.muster@example.com"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Rolle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            >
              {Object.values(ROLES).map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={assignLager}
                onChange={(e) => setAssignLager(e.target.checked)}
                className="rounded border border-border"
                disabled={loading}
              />
              <span className="text-[12.5px] font-medium text-foreground">
                Sofort Lager zuweisen
              </span>
            </label>
            {assignLager && (
              <div className="ml-6 space-y-2">
                {['Küche', 'Restaurant', 'Brauerei'].map((lagername) => (
                  <label key={lagername} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedLager.has(lagername)}
                      onChange={(e) => {
                        const next = new Set(selectedLager)
                        if (e.target.checked) next.add(lagername)
                        else next.delete(lagername)
                        setSelectedLager(next)
                      }}
                      className="rounded border border-border"
                      disabled={loading}
                    />
                    <span className="text-[12.5px] text-foreground">{lagername}</span>
                  </label>
                ))}
              </div>
            )}
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
              onClick={handleInvite}
              className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Wird gesendet…' : 'Einladen'}
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
