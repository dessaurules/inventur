import { cn } from '../../lib/cn.js'
import { LAGER_OPTIONS } from './types.js'

/**
 * @param {object} props
 * @param {Record<string, number>} props.countsByLager - { alle, küche, restaurant, brauerei }
 * @param {string} props.activeLager - 'alle' | 'küche' | 'restaurant' | 'brauerei'
 * @param {(lager: string) => void} props.onSelectLager
 */
export function SidebarLager({ countsByLager, activeLager, onSelectLager }) {
  const lagerOrder = ['alle', 'küche', 'restaurant', 'brauerei']

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Lager</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {lagerOrder.map((lagerKey) => (
          <button
            key={lagerKey}
            type="button"
            onClick={() => onSelectLager(lagerKey)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
              activeLager === lagerKey
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <span>{LAGER_OPTIONS[lagerKey].label}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {countsByLager[lagerKey] ?? 0}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
