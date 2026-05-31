import { useState } from 'react'
import { toast } from 'sonner'
import { ROLES, formatLastActive } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

export function EmployeeTable({
  employees,
  selectedId,
  onSelectRow,
  onInviteClick,
  onRoleChange,
  onLagerAssign,
}) {
  const [changingRoleId, setChangingRoleId] = useState(null)

  const handleRoleChange = async (employeeId, newRole) => {
    setChangingRoleId(employeeId)
    try {
      await pb.collection(PB_COLLECTIONS.users).update(employeeId, { role: newRole })
      toast.success('Rolle aktualisiert')
      await onRoleChange(employeeId, newRole)
    } catch (err) {
      toast.error('Rolle konnte nicht geändert werden')
      console.error(err)
    } finally {
      setChangingRoleId(null)
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Mitarbeiter ({employees.length})</h2>
        <button
          type="button"
          onClick={onInviteClick}
          className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Mitarbeiter
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 border-b border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="min-w-[180px] text-[11px] font-medium text-muted-foreground">Name</div>
            <div className="min-w-[200px] text-[11px] font-medium text-muted-foreground">E-Mail</div>
            <div className="w-[120px] text-[11px] font-medium text-muted-foreground">Rolle</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Lager</div>
            <div className="w-[80px] text-[11px] font-medium text-muted-foreground">Status</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Zuletzt aktiv</div>
            <div className="w-[120px] text-[11px] font-medium text-muted-foreground">Erstellt</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {employees.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[13px] text-muted-foreground">
              Keine Mitarbeiter in dieser Kategorie.
            </div>
          ) : (
            employees.map((emp) => (
              <div
                key={emp.id}
                onClick={() => onSelectRow(emp.id)}
                className={`flex min-h-0 border-b border-border/50 px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === emp.id ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-4 items-center">
                  <div className="min-w-[180px] text-[12.5px] font-medium truncate">
                    {emp.fullName || emp.email}
                  </div>
                  <div className="min-w-[200px] text-[12.5px] text-muted-foreground truncate">
                    {emp.email}
                  </div>

                  <div className="w-[120px]" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={emp.role}
                      onChange={(e) => handleRoleChange(emp.id, e.target.value)}
                      disabled={changingRoleId === emp.id}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] font-medium focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    >
                      {Object.values(ROLES).map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-[100px]" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onLagerAssign(emp.id)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground hover:bg-muted/60"
                    >
                      Zuweisen
                    </button>
                  </div>

                  <div className="w-[80px] text-[12.5px]">
                    {emp.active ? (
                      <span className="inline-flex rounded-md bg-green-100 px-2 py-1 text-[11px] font-medium text-green-800">
                        Aktiv
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        Inaktiv
                      </span>
                    )}
                  </div>

                  <div className="w-[100px] text-[12px] text-muted-foreground">
                    {formatLastActive(emp.lastActiveAt)}
                  </div>

                  <div className="w-[120px] text-[11px] text-muted-foreground">
                    {emp.createdAt ? new Date(emp.createdAt).toLocaleDateString('de-DE') : '—'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
