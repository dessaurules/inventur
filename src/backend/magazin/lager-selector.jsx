/**
 * Lager-Auswahl Dropdown für Magazin-Sidebar.
 * Nur sichtbar wenn 2 oder mehr Lager vorhanden sind.
 *
 * @param {{ lagerList: Array<{id:string, name:string}>, selectedId: string|null, onSelect: (id:string)=>void }} props
 */
export function LagerSelector({ lagerList, selectedId, onSelect }) {
  if (!lagerList || lagerList.length <= 1) return null

  return (
    <div className="px-3 pt-2.5 pb-1.5 border-b border-border/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Lager
      </p>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {lagerList.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  )
}
