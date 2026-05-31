import { useState } from 'react'
import { toast } from 'sonner'
import { formatDate, formatEuro, INVENTORY_STATUSES } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {object|null} props.inventory - Selected inventory or null
 * @param {() => Promise<void>} props.onUpdate - Callback nach Update
 */
export function InventoryDetail({ inventory, onUpdate }) {
  const [loading, setLoading] = useState(false)

  if (!inventory) {
    return (
      <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-muted/20 p-4">
        <p className="text-[13px] text-muted-foreground">Wähle eine Inventur aus</p>
      </div>
    )
  }

  const handleStatusChange = async (newStatus) => {
    setLoading(true)
    try {
      const updateData = { status: newStatus }
      if (newStatus === 'aktiv' && !inventory.startDatum) {
        updateData.start_time = new Date().toISOString()
      }
      if (newStatus === 'abgeschlossen' && !inventory.endDatum) {
        updateData.end_time = new Date().toISOString()
      }
      await pb.collection(PB_COLLECTIONS.zaehlSessions).update(inventory.id, updateData)
      toast.success(`Status zu "${INVENTORY_STATUSES[newStatus]?.label}" geändert`)
      await onUpdate()
    } catch {
      toast.error('Status konnte nicht geändert werden')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!window.confirm('Inventur archivieren?')) return
    setLoading(true)
    try {
      // Kopiere zu inventur_archiv
      await pb.collection(PB_COLLECTIONS.inventurArchiv).create({
        name: inventory.name,
        lager: inventory.lager,
        session_owner: inventory.verantwortlicher,
        standort: inventory.tenantId,
        status: 'abgeschlossen',
        artikel_count: inventory.artikelCount,
        abweichungen: inventory.abweichungen,
        euro_wert_soll: inventory.euroWertSoll,
        euro_wert_ist: inventory.euroWertIst,
        start_time: inventory.startDatum,
        end_time: inventory.endDatum,
        notizen: inventory.notizen,
      })
      // Lösche aus zaehl_sessions
      await pb.collection(PB_COLLECTIONS.zaehlSessions).delete(inventory.id)
      toast.success('Inventur archiviert')
      await onUpdate()
    } catch {
      toast.error('Archivierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const euroDiff = inventory.euroWertIst - inventory.euroWertSoll

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <h3 className="truncate text-sm font-semibold">{inventory.name}</h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-4">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Lager</p>
          <p className="text-[13px] text-foreground">{inventory.lager}</p>
        </div>

        <div className="mb-4">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Verantwortlicher</p>
          <p className="text-[13px] text-foreground">{inventory.verantwortlicher}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Status</p>
          <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${
            inventory.status === 'aktiv' ? 'bg-green-100 text-green-800' :
            inventory.status === 'abgeschlossen' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {INVENTORY_STATUSES[inventory.status]?.label || inventory.status}
          </span>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Artikel gezählt</p>
          <p className="text-[13px] text-foreground">{inventory.artikelCount}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Abweichungen</p>
          <p className="text-[13px] text-foreground">{inventory.abweichungen}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Euro-Wert (Soll)</p>
          <p className="text-[13px] text-foreground">{formatEuro(inventory.euroWertSoll)}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Euro-Wert (Ist)</p>
          <p className="text-[13px] text-foreground">{formatEuro(inventory.euroWertIst)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Differenz</p>
          <p className={`text-[13px] font-medium ${euroDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatEuro(euroDiff)}
          </p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Startdatum</p>
          <p className="text-[13px] text-foreground">{formatDate(inventory.startDatum)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Enddatum</p>
          <p className="text-[13px] text-foreground">{formatDate(inventory.endDatum)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Notizen</p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{inventory.notizen || '—'}</p>
        </div>

        <hr className="border-border my-4" />

        <div className="space-y-2">
          {inventory.status === 'vorbereitung' && (
            <button
              type="button"
              onClick={() => handleStatusChange('aktiv')}
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Starten
            </button>
          )}
          {inventory.status === 'aktiv' && (
            <button
              type="button"
              onClick={() => handleStatusChange('abgeschlossen')}
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Abschließen
            </button>
          )}
          {inventory.status === 'abgeschlossen' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={loading}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              Archivieren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
