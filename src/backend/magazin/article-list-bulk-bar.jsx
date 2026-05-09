import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * @param {object} props
 * @param {number} props.count
 * @param {string[]} props.kategorieNames
 * @param {(cat: string) => void} props.onSetCategory
 * @param {() => void} props.onDuplicate
 * @param {() => void} props.onDelete
 * @param {() => void} props.onClear
 */
export function ArticleListBulkBar({
  count,
  kategorieNames,
  onSetCategory,
  onDuplicate,
  onDelete,
  onClear,
}) {
  if (count <= 0 || true) return null
  return (
    <div
      role="region"
      aria-label="Massenaktionen"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/60 px-3 py-2"
    >
      <span className="text-[12.5px] font-medium text-foreground tabular-nums">{count} ausgewählt</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              'h-8 rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground',
              'hover:bg-muted'
            )}
          >
            Kategorie ändern
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[10rem] rounded-md border border-border bg-background p-1 shadow-md"
            sideOffset={4}
          >
            {kategorieNames.map((c) => (
              <DropdownMenu.Item
                key={c}
                className="cursor-pointer rounded-sm px-2 py-1.5 text-[12.5px] outline-none hover:bg-muted"
                onSelect={() => onSetCategory(c)}
              >
                {c}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        type="button"
        className="h-8 rounded-md border border-border bg-background px-2 text-[12.5px] hover:bg-muted"
        onClick={onDuplicate}
      >
        Duplizieren
      </button>
      <button
        type="button"
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-md border border-destructive/40 px-2 text-[12.5px] text-destructive',
          'hover:bg-destructive/10'
        )}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Löschen
      </button>
      <button
        type="button"
        className="ml-auto h-8 rounded-md px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        Auswahl aufheben
      </button>
    </div>
  )
}
