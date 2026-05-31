import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Archive, Clock, GripVertical, Package, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { loadCategoryOrder, saveCategoryOrder } from './types.js'

function SortableCatRow({ id, label, count, active, onClick, onRename, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const [editing, setEditing] = useState(false)
  const [renameValue, setRenameValue] = useState(label)
  const [hovered, setHovered] = useState(false)

  if (editing) {
    return (
      <li className="px-2 py-0.5">
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const t = renameValue.trim()
              if (t && t !== label) onRename?.(label, t)
              setEditing(false)
            }
            if (e.key === 'Escape') {
              setRenameValue(label)
              setEditing(false)
            }
          }}
          onBlur={() => {
            const t = renameValue.trim()
            if (t && t !== label) onRename?.(label, t)
            setEditing(false)
          }}
          aria-label="Kategorie umbenennen"
        />
      </li>
    )
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('flex items-stretch gap-0.5', isDragging && 'opacity-60')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex shrink-0 items-center rounded-md px-0.5 text-muted-foreground hover:bg-muted/60"
        aria-label={`Kategorie ${label} verschieben`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={(e) => {
          e.preventDefault()
          setRenameValue(label)
          setEditing(true)
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]',
          active
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(label)}
          className={cn(
            'flex shrink-0 items-center rounded-md px-1 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive',
            hovered ? 'opacity-100' : 'opacity-0'
          )}
          aria-label={`Kategorie ${label} löschen`}
          tabIndex={hovered ? 0 : -1}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

/**
 * @param {object} props
 * @param {string[]} props.categoryNames
 * @param {Record<string, number>} props.countsByCategory
 * @param {string} props.activeSidebar — 'all' | '__nocat' | '__recent' | category name
 * @param {(k: string) => void} props.onSelectSidebar
 * @param {string[]} props.smartCounts — [nocat, recent, archived]
 * @param {() => void} props.onAddCategory
 * @param {(from: string, to: string) => void} props.onRenameCategory
 * @param {(name: string) => void} [props.onDeleteCategory]
 * @param {(order: string[]) => void} [props.onCategoryOrderChange]
 */
export function SidebarCategories({
  categoryNames,
  countsByCategory,
  activeSidebar,
  onSelectSidebar,
  smartCounts,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onCategoryOrderChange,
}) {
  const baseOrdered = useMemo(() => {
    const merged = [...categoryNames]
    const saved = loadCategoryOrder(merged)
    return saved?.length
      ? [...saved.filter((c) => merged.includes(c)), ...merged.filter((c) => !saved.includes(c))]
      : merged
  }, [categoryNames])

  const [dragOrdered, setDragOrdered] = useState(/** @type {string[] | null} */ (null))

  const ordered = useMemo(() => {
    if (!dragOrdered) return baseOrdered
    const s = new Set(baseOrdered)
    if (dragOrdered.length !== baseOrdered.length || !dragOrdered.every((c) => s.has(c))) {
      return baseOrdered
    }
    return dragOrdered
  }, [dragOrdered, baseOrdered])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const allCount = useMemo(
    () => Object.values(countsByCategory).reduce((a, b) => a + b, 0),
    [countsByCategory]
  )

  const onDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDragOrdered((prev) => {
      let cur = prev
      const s = new Set(baseOrdered)
      if (!cur || cur.length !== baseOrdered.length || !cur.every((c) => s.has(c))) {
        cur = baseOrdered
      }
      const oldIndex = cur.indexOf(String(active.id))
      const newIndex = cur.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return prev
      const next = arrayMove(cur, oldIndex, newIndex)
      saveCategoryOrder(next)
      onCategoryOrderChange?.(next)
      return next
    })
  }

  const [noCatC, recentC, archivedC] = smartCounts

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Kategorien</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2" aria-label="Kategorien">
        <div>
          <button
            type="button"
            onClick={() => onSelectSidebar('all')}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
              activeSidebar === 'all'
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60'
            )}
          >
            <span>Alle</span>
            <span className="tabular-nums text-xs text-muted-foreground">{allCount}</span>
          </button>
        </div>
        <div>
          <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">Kategorien</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-0.5">
                {ordered.map((name) => (
                  <SortableCatRow
                    key={name}
                    id={name}
                    label={name}
                    count={countsByCategory[name] ?? 0}
                    active={activeSidebar === name}
                    onClick={() => onSelectSidebar(name)}
                    onRename={onRenameCategory}
                    onDelete={onDeleteCategory}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={onAddCategory}
            className="mt-2 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Kategorie
          </button>
        </div>
        <div>
          <div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">Smart-Listen</div>
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => onSelectSidebar('__nocat')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
                  activeSidebar === '__nocat'
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Ohne Kategorie
                </span>
                <span className="tabular-nums text-xs">{noCatC}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onSelectSidebar('__recent')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
                  activeSidebar === '__recent'
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Zuletzt bearbeitet
                </span>
                <span className="tabular-nums text-xs">{recentC}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onSelectSidebar('__archived')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
                  activeSidebar === '__archived'
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5" />
                  Archiviert
                </span>
                <span className="tabular-nums text-xs">{archivedC ?? 0}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>
  )
}
