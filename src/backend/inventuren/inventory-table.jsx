import { INVENTORY_STATUSES, formatDate, formatEuro } from './types.js'

/**
 * @param {object} props
 * @param {Array} props.inventuren - Filtered inventory list
 * @param {string|null} props.selectedId - Current selection for detail panel
 * @param {(id: string) => void} props.onSelectRow
 * @param {() => void} props.onNewClick
 * @param {() => void} props.onExportClick
 */
export function InventoryTable({
  inventuren,
  selectedId,
  onSelectRow,
  onNewClick,
  onExportClick,
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Inventuren ({inventuren.length})</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportClick}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] text-foreground hover:bg-muted/60"
          >
            Export
          </button>
          <button
            type="button"
            onClick={onNewClick}
            className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Neue Inventur
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 border-b border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="min-w-[150px] text-[11px] font-medium text-muted-foreground">Name</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Lager</div>
            <div className="w-[80px] text-[11px] font-medium text-muted-foreground">Artikel</div>
            <div className="w-[80px] text-[11px] font-medium text-muted-foreground">Abw.</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Status</div>
            <div className="w-[120px] text-[11px] font-medium text-muted-foreground">Verantwort.</div>
            <div className="w-[150px] text-[11px] font-medium text-muted-foreground">Startdatum</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {inventuren.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[13px] text-muted-foreground">
              Keine Inventuren in diesem Lager.
            </div>
          ) : (
            inventuren.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onSelectRow(inv.id)}
                className={`flex min-h-0 border-b border-border/50 px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === inv.id ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-4 items-center">
                  <div className="min-w-[150px] text-[12.5px] font-medium truncate">{inv.name}</div>
                  <div className="w-[100px] text-[12.5px] text-muted-foreground truncate">{inv.lager}</div>
                  <div className="w-[80px] text-[12.5px]">{inv.artikelCount}</div>
                  <div className="w-[80px] text-[12.5px]">{inv.abweichungen}</div>
                  <div className="w-[100px] text-[12.5px]">
                    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${
                      inv.status === 'aktiv' ? 'bg-green-100 text-green-800' :
                      inv.status === 'abgeschlossen' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {INVENTORY_STATUSES[inv.status]?.label || inv.status}
                    </span>
                  </div>
                  <div className="w-[120px] text-[12px] text-muted-foreground truncate">{inv.verantwortlicher}</div>
                  <div className="w-[150px] text-[11px] text-muted-foreground">{formatDate(inv.startDatum)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
