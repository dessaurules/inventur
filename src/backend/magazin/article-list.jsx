import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Check, FileSpreadsheet, FileText, Plus } from 'lucide-react'
import { ArticleRow } from './article-row.jsx'
import { ArticleListToolbar } from './article-list-toolbar.jsx'
import { ArticleListBulkBar } from './article-list-bulk-bar.jsx'
import { cn } from '../../lib/cn.js'

function SelectAllCheckbox({ total, selected, onSelectAll }) {
  const allSelected = total > 0 && selected === total
  const indeterminate = selected > 0 && selected < total

  if (!onSelectAll) return <span />

  return (
    <span className="flex items-center justify-center">
      <Checkbox.Root
        checked={indeterminate ? 'indeterminate' : allSelected}
        onCheckedChange={onSelectAll}
        aria-label="Alle auswählen"
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border border-input bg-white',
          'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
          'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground'
        )}
      >
        <Checkbox.Indicator>
          {indeterminate ? (
            <span className="block h-0.5 w-2.5 rounded-full bg-current" />
          ) : (
            <Check className="h-3 w-3" strokeWidth={3} />
          )}
        </Checkbox.Indicator>
      </Checkbox.Root>
    </span>
  )
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {number} props.totalCount
 * @param {import('./types.js').MagazinArtikel[]} props.rows
 * @param {string | null} props.activeId
 * @param {Set<string>} props.selectedIds
 * @param {(id: string) => void} props.onActivate
 * @param {(id: string, selected: boolean, opts?: { shift?: boolean, index?: number }) => void} props.onSelect
 * @param {string} props.query
 * @param {(q: string) => void} props.onQuery
 * @param {'name' | 'nr' | 'updated'} props.sort
 * @param {(s: 'name' | 'nr' | 'updated') => void} props.onSort
 * @param {boolean} props.readOnly
 * @param {() => void} props.onNewArticle
 * @param {() => void} props.onExcelClick
 * @param {() => void} [props.onPdfInvoiceClick]
 * @param {object} props.bulk
 * @param {() => void} [props.onSelectAll]
 * @param {import('react').RefObject<HTMLDivElement | null>} [props.scrollParentRef]
 */
export function ArticleList({
  title,
  totalCount,
  rows,
  activeId,
  selectedIds,
  onActivate,
  onSelect,
  onSelectAll,
  query,
  onQuery,
  sort,
  onSort,
  readOnly,
  onNewArticle,
  onExcelClick,
  onPdfInvoiceClick,
  bulk,
  scrollParentRef,
}) {
  const internalRef = useRef(null)
  const scrollRef = scrollParentRef ?? internalRef
  const useVirtual = rows.length > 100

  /* TanStack Virtual: absichtlich nicht memoization-kompatibel (React Compiler). */
  // eslint-disable-next-line react-hooks/incompatible-library -- Virtualisierung bei >100 Zeilen
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
    enabled: useVirtual,
  })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-[12px] text-muted-foreground tabular-nums">{totalCount} Artikel</p>
        </div>
        <Tooltip.Provider delayDuration={400}>
          {onPdfInvoiceClick ? (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={onPdfInvoiceClick}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12.5px]',
                    'hover:bg-muted'
                  )}
                  aria-label="Rechnung hochladen"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={6}
                  className="z-[300] max-w-[220px] rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground shadow-md"
                >
                  Rechnung hochladen — Preise aus E-Preis / Gebinde
                  <Tooltip.Arrow className="fill-border" width={10} height={5} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ) : null}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={onExcelClick}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12.5px]',
                  'hover:bg-muted'
                )}
                aria-label="Excel hochladen"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="bottom"
                sideOffset={6}
                className="z-[300] max-w-[220px] rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground shadow-md"
              >
                Excel hochladen — Artikel importieren
                <Tooltip.Arrow className="fill-border" width={10} height={5} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <button
          type="button"
          onClick={onNewArticle}
          disabled={readOnly}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground',
            'hover:opacity-90 disabled:opacity-50'
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Artikel
        </button>
      </header>
      <ArticleListToolbar query={query} onQuery={onQuery} sort={sort} onSort={onSort} />
      <ArticleListBulkBar {...bulk} />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        role="region"
        aria-label="Artikelliste"
      >
        <div
          className={cn(
            'sticky top-0 z-10 grid grid-cols-[2rem_5.5rem_minmax(0,1fr)_5.75rem_5rem] gap-2 border-b border-border bg-background px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
          )}
        >
          <SelectAllCheckbox
            total={rows.length}
            selected={selectedIds.size}
            onSelectAll={onSelectAll}
          />
          <span>Nr.</span>
          <span>Name</span>
          <span className="text-right">Preis</span>
          <span>Einh.</span>
        </div>
        {useVirtual ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const artikel = rows[vi.index]
              return (
                <ArticleRow
                  key={artikel.id}
                  artikel={artikel}
                  selected={selectedIds.has(artikel.id)}
                  active={activeId === artikel.id}
                  onRowClick={() => onActivate(artikel.id)}
                  onToggleSelect={(checked, meta) =>
                    onSelect(artikel.id, checked, { index: vi.index, shift: meta.shiftKey })
                  }
                  virtualStyle={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                />
              )
            })}
          </div>
        ) : (
          rows.map((artikel, index) => (
            <ArticleRow
              key={artikel.id}
              artikel={artikel}
              selected={selectedIds.has(artikel.id)}
              active={activeId === artikel.id}
              onRowClick={() => onActivate(artikel.id)}
              onToggleSelect={(checked, meta) =>
                onSelect(artikel.id, checked, { index, shift: meta.shiftKey })
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
