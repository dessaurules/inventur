import { useRef } from 'react'
import { Check } from 'lucide-react'
import * as Checkbox from '@radix-ui/react-checkbox'
import { cn } from '../../lib/cn.js'
import { formatPreisEUR } from './format.js'

/**
 * @param {object} props
 * @param {import('./types.js').MagazinArtikel} props.artikel
 * @param {boolean} props.selected
 * @param {boolean} props.active
 * @param {() => void} props.onRowClick
 * @param {(checked: boolean, meta: { shiftKey: boolean }) => void} props.onToggleSelect
 * @param {React.CSSProperties} [props.virtualStyle]
 */
export function ArticleRow({ artikel, selected, active, onRowClick, onToggleSelect, virtualStyle }) {
  const shiftRef = useRef(false)
  return (
    <div
      role="row"
      style={virtualStyle}
      data-nr={artikel.nr}
      data-id={artikel.id}
      onClick={onRowClick}
      className={cn(
        'grid cursor-pointer grid-cols-[2rem_5.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border px-3 py-1.5 text-[12.5px]',
        active ? 'border-l-2 border-l-primary bg-muted' : 'border-l-2 border-l-transparent',
        selected && !active ? 'bg-muted/40' : '',
        'hover:bg-muted/50'
      )}
    >
      <div role="cell" className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox.Root
          checked={selected}
          onPointerDown={(e) => {
            shiftRef.current = e.shiftKey
          }}
          onCheckedChange={(v) => onToggleSelect(v === true, { shiftKey: shiftRef.current })}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded border border-input bg-white',
            'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground'
          )}
          aria-label={`Auswahl ${artikel.name}`}
        >
          <Checkbox.Indicator>
            <Check className="h-3 w-3" strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </div>
      <div role="cell" className="font-mono text-[12px] text-muted-foreground tabular-nums">
        {artikel.artikelnummer || '—'}
      </div>
      <div role="cell" className="min-w-0 flex-1 truncate font-medium text-foreground">
        {artikel.name}
      </div>
      <div role="cell" className="shrink-0 text-right text-[12px] text-muted-foreground">
        {artikel.einheit}
      </div>
      <div role="cell" className="shrink-0 text-right font-mono text-[12px] tabular-nums text-foreground">
        {formatPreisEUR(artikel.preis)}
      </div>
    </div>
  )
}
