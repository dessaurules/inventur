import { ArrowDownAZ, Filter, Search } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * @param {object} props
 * @param {string} props.query
 * @param {(q: string) => void} props.onQuery
 * @param {'name' | 'nr' | 'updated'} props.sort
 * @param {(s: 'name' | 'nr' | 'updated') => void} props.onSort
 */
export function ArticleListToolbar({ query, onQuery, sort, onSort }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
      <div className="relative min-w-[12rem] flex-1 max-w-md">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Suchen…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className={cn(
            'h-8 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-[12.5px]',
            'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label="Artikel suchen"
        />
      </div>
      <button
        type="button"
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12.5px] text-muted-foreground',
          'hover:bg-muted hover:text-foreground'
        )}
        aria-label="Filter (Platzhalter)"
        disabled
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
      </button>
      <div className="relative">
        <select
          value={sort}
          onChange={(e) => onSort(/** @type {'name' | 'nr' | 'updated'} */ (e.target.value))}
          className={cn(
            'h-8 appearance-none rounded-md border border-border bg-background py-1 pl-2 pr-7 text-[12.5px] text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label="Sortierung"
        >
          <option value="name">Name A–Z</option>
          <option value="nr">Nr.</option>
          <option value="updated">Zuletzt bearbeitet</option>
        </select>
        <ArrowDownAZ className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
}
