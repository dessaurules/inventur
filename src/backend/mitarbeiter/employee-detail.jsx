import { useState } from 'react'
import { toast } from 'sonner'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'
import { formatLastActive } from './types.js'

export function EmployeeDetail({ employee, onClose, onChanged }) {
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  if (!employee) {
    return (
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-border bg-background">
        <div className="flex h-12 items-center border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-muted-foreground">Keine Auswahl</span>
        </div>
      </aside>
    )
  }

  const handleDeactivate = async () => {
    if (!window.confirm(`${employee.fullName || employee.email} deaktivieren?`)) {
      return
    }
    setIsDeactivating(true)
    try {
      await pb.collection(PB_COLLECTIONS.users).update(employee.id, { active: false })
      toast.success('Mitarbeiter deaktiviert')
      await onChanged()
    } catch (err) {
      toast.error('Deaktivierung fehlgeschlagen')
      console.error(err)
    } finally {
      setIsDeactivating(false)
    }
  }

  const handleResetPassword = async () => {
    if (!window.confirm(`Passwort-Rücksetzungsmail für ${employee.email} senden?`)) {
      return
    }
    setIsResettingPassword(true)
    try {
      await pb.collection(PB_COLLECTIONS.users).requestPasswordReset(employee.email)
      toast.success('Passwort-Rücksetzungsmail gesendet')
    } catch (err) {
      toast.error('Mail konnte nicht gesendet werden')
      console.error(err)
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Details</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="space-y-4 p-3">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">Name</div>
            <div className="text-[13px] font-medium text-foreground">
              {employee.fullName || '—'}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">E-Mail</div>
            <div className="text-[13px] text-foreground">{employee.email}</div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">Status</div>
            <div className="text-[13px] text-foreground">
              {employee.active ? (
                <span className="inline-flex rounded-md bg-green-100 px-2 py-1 text-[11px] font-medium text-green-800">
                  Aktiv
                </span>
              ) : (
                <span className="inline-flex rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Inaktiv
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">Zuletzt aktiv</div>
            <div className="text-[13px] text-foreground">
              {formatLastActive(employee.lastActiveAt)}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">Erstellt</div>
            <div className="text-[13px] text-foreground">
              {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString('de-DE') : '—'}
            </div>
          </div>

          <hr className="border-border/50" />

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResettingPassword}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              {isResettingPassword ? 'Mail wird gesendet…' : 'Passwort zurücksetzen'}
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isDeactivating || !employee.active}
              className="w-full rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {isDeactivating ? 'Wird deaktiviert…' : 'Deaktivieren'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
