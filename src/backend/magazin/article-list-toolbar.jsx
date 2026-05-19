import { ArrowDownAZ, Filter, Search } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * @param {object} props
 * @param {string} props.query
 * @param {(q: string) => void} props.onQuery
 * @param {import('./article-list-sort.js').MagazinSortState} props.sort
 * @param {(s: import('./article-list-sort.js').MagazinSortState) => void} props.onSort
 */
export function ArticleListToolbar({ query, onQuery, sort, onSort }) {
  const sortValue = `${sort.key}:${sort.dir}`
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
          value={sortValue}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':')
            onSort({
              key: /** @type {import('./article-list-sort.js').MagazinSortKey} */ (key),
              dir: /** @type {import('./article-list-sort.js').MagazinSortDir} */ (dir),
            })
          }}
          className={cn(
            'h-8 appearance-none rounded-md border border-border bg-background py-1 pl-2 pr-7 text-[12.5px] text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label="Sortierung"
        >
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="nr:asc">Nr. aufsteigend</option>
          <option value="nr:desc">Nr. absteigend</option>
          <option value="preis:asc">Preis aufsteigend</option>
          <option value="preis:desc">Preis absteigend</option>
          <option value="einheit:asc">Einheit A–Z</option>
          <option value="einheit:desc">Einheit Z–A</option>
          <option value="updated:desc">Zuletzt bearbeitet</option>
        </select>
        <ArrowDownAZ className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
}
