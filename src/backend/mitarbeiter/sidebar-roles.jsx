import { cn } from '../../lib/cn.js'
import { ROLES } from './types.js'

/**
 * @param {object} props
 * @param {Record<string, number>} props.countsByRole - { all, mitarbeiter, schichtleiter, admin }
 * @param {string} props.activeRole - 'all' | 'mitarbeiter' | 'schichtleiter' | 'admin'
 * @param {(role: string) => void} props.onSelectRole
 */
export function SidebarRoles({ countsByRole, activeRole, onSelectRole }) {
  const roleOptions = [
    { key: 'all', label: 'Alle' },
    { key: 'admin', label: 'Admin' },
    { key: 'lagerleiter', label: 'Lagerleiter' },
    { key: 'inventur', label: 'Inventur' },
    { key: 'magazin_readonly', label: 'Nur Lesen' },
  ]

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Rollen</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {roleOptions.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelectRole(key)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
              activeRole === key
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <span>{label}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {countsByRole[key] ?? 0}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
