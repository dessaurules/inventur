import { useEffect, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SidebarLager } from './sidebar-lager.jsx'
import { InventoryTable } from './inventory-table.jsx'
import { InventoryDetail } from './inventory-detail.jsx'
import { NewInventoryDialog } from './new-inventory-dialog.jsx'
import { mapPbRecordToInventory, countsByLager, filterByLager } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {object} props.currentUser - Current authenticated user (with tenantId)
 */
export function InventurenShell({ currentUser }) {
  const [activeLager, setActiveLager] = useState('alle')
  const [selectedInventurId, setSelectedInventurId] = useState(null)
  const [inventurenDialogOpen, setInventurenDialogOpen] = useState(false)
  const [verantwortliche, setVerantwortliche] = useState([])

  const { data: inventuren = [], refetch: refetchInventuren } = useQuery({
    queryKey: ['inventuren', currentUser?.tenantId],
    queryFn: async () => {
      if (!currentUser?.tenantId) return []
      try {
        const records = await pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
          filter: `standort = "${currentUser.tenantId}"`,
          expand: 'session_owner',
          sort: '-created',
        })
        return records.map(mapPbRecordToInventory)
      } catch (err) {
        toast.error('Inventuren konnten nicht geladen werden')
        console.error(err)
        return []
      }
    },
    enabled: !!currentUser?.tenantId,
  })

  // Load Schichtleiter/Admin list for dialog
  useEffect(() => {
    const loadVerantwortliche = async () => {
      if (!currentUser?.tenantId) return
      try {
        const records = await pb.collection(PB_COLLECTIONS.users).getFullList({
          filter: `tenant_id = "${currentUser.tenantId}" && (role = "schichtleiter" || role = "admin")`,
        })
        setVerantwortliche(records.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` })))
      } catch (err) {
        console.error('Failed to load verantwortliche:', err)
      }
    }
    loadVerantwortliche()
  }, [currentUser?.tenantId])

  // Subscribe to real-time updates
  const memoRefetch = useCallback(() => refetchInventuren(), [refetchInventuren])

  useEffect(() => {
    if (!currentUser?.tenantId) return
    let unsubscribe = null
    const subscribe = async () => {
      try {
        unsubscribe = await pb.collection(PB_COLLECTIONS.zaehlSessions).subscribe('*', () => {
          memoRefetch()
        })
      } catch (err) {
        console.error('Subscribe error:', err)
      }
    }
    subscribe()
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe().catch(() => {})
      }
    }
  }, [currentUser?.tenantId, memoRefetch])

  // Filter inventuren by lager
  const filteredInventuren = useMemo(() => filterByLager(inventuren, activeLager), [inventuren, activeLager])
  const lagerCounts = useMemo(() => countsByLager(inventuren), [inventuren])
  const selectedInventur = useMemo(() => inventuren.find((i) => i.id === selectedInventurId), [inventuren, selectedInventurId])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <SidebarLager
        countsByLager={lagerCounts}
        activeLager={activeLager}
        onSelectLager={(lager) => {
          setActiveLager(lager)
          setSelectedInventurId(null)
        }}
      />
      <InventoryTable
        inventuren={filteredInventuren}
        selectedId={selectedInventurId}
        onSelectRow={setSelectedInventurId}
        onNewClick={() => setInventurenDialogOpen(true)}
        onExportClick={() => toast.info('Export wird implementiert in späteren Tasks')}
      />
      <InventoryDetail inventory={selectedInventur} onUpdate={refetchInventuren} />
      <NewInventoryDialog
        open={inventurenDialogOpen}
        onOpenChange={setInventurenDialogOpen}
        tenantId={currentUser?.tenantId}
        verantwortliche={verantwortliche}
        onInventoryCreated={refetchInventuren}
      />
    </div>
  )
}
