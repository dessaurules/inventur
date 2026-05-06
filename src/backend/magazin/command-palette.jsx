import { useEffect } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { FileSpreadsheet, Package, Pencil, Search } from 'lucide-react'
import { cn } from '../../lib/cn.js'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(v: boolean) => void} props.onOpenChange
 * @param {import('./types.js').MagazinArtikel[]} props.articles
 * @param {string[]} props.categories
 * @param {(id: string) => void} props.onSelectArticle
 * @param {(cat: string) => void} props.onSelectCategory
 * @param {() => void} props.onNewArticle
 * @param {() => void} props.onExcelImport
 * @param {() => void} props.onExport
 */
export function CommandPalette({
  open,
  onOpenChange,
  articles,
  categories,
  onSelectArticle,
  onSelectCategory,
  onNewArticle,
  onExcelImport,
  onExport,
}) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const input = document.querySelector('[data-magazin-command-input]')
      if (input instanceof HTMLInputElement) input.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  const sortedForEmpty = [...articles].sort((a, b) => {
    const ta = a.updatedAt?.getTime() ?? 0
    const tb = b.updatedAt?.getTime() ?? 0
    return tb - ta
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[15%] z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-background p-0 shadow-lg',
            'focus:outline-none'
          )}
          aria-label="Befehlspalette"
        >
          <Command className="flex max-h-[min(24rem,70vh)] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                data-magazin-command-input
                placeholder="Artikel oder Aktion suchen…"
                className="h-11 w-full border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-[12.5px] text-muted-foreground">
                Keine Treffer.
              </Command.Empty>
              <Command.Group heading="Aktionen" className="mb-2 text-[11px] font-medium text-muted-foreground">
                <Command.Item
                  value="neuer-artikel"
                  onSelect={() => {
                    onNewArticle()
                    onOpenChange(false)
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-foreground aria-selected:bg-muted"
                >
                  <Package className="h-3.5 w-3.5" />
                  Neuer Artikel
                </Command.Item>
                <Command.Item
                  value="excel-importieren"
                  onSelect={() => {
                    onExcelImport()
                    onOpenChange(false)
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-foreground aria-selected:bg-muted"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel importieren
                </Command.Item>
                <Command.Item
                  value="export"
                  onSelect={() => {
                    onExport()
                    onOpenChange(false)
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12.5px] text-foreground aria-selected:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Export (Platzhalter)
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Artikel" className="mb-2 text-[11px] font-medium text-muted-foreground">
                {(sortedForEmpty.length ? sortedForEmpty : articles).slice(0, 80).map((a) => (
                  <Command.Item
                    key={a.id}
                    value={`${a.artikelnummer} ${a.name}`}
                    onSelect={() => {
                      onSelectArticle(a.id)
                      onOpenChange(false)
                    }}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-[12.5px] aria-selected:bg-muted"
                  >
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{a.artikelnummer}</span>{' '}
                    <span className="text-foreground">{a.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Kategorien" className="text-[11px] font-medium text-muted-foreground">
                {categories.map((c) => (
                  <Command.Item
                    key={c}
                    value={`kategorie ${c}`}
                    onSelect={() => {
                      onSelectCategory(c)
                      onOpenChange(false)
                    }}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-[12.5px] aria-selected:bg-muted"
                  >
                    {c}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
