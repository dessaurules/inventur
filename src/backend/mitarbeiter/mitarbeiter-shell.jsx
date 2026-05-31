import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'
import { mapPbRecordToEmployee, countsByRole, filterByRole } from './types.js'
import { SidebarRoles } from './sidebar-roles.jsx'
import { EmployeeTable } from './employee-table.jsx'
import { EmployeeDetail } from './employee-detail.jsx'
import { InviteDialog } from './invite-dialog.jsx'

export function MitarbeiterShell({ currentUser }) {
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  const { data: employees = [], refetch: refetchEmployees } = useQuery({
    queryKey: ['mitarbeiter', currentUser?.tenantId],
    queryFn: async () => {
      if (!currentUser?.tenantId) return []
      try {
        const records = await pb.collection(PB_COLLECTIONS.users).getFullList({
          filter: `tenant_id = "${currentUser.tenantId}"`,
          sort: '-created',
        })
        return records.map(mapPbRecordToEmployee)
      } catch (err) {
        console.error('Error fetching employees:', err)
        return []
      }
    },
    enabled: !!currentUser?.tenantId,
  })

  // Memoize refetch to prevent subscription re-subscriptions
  const memoRefetch = useCallback(() => {
    refetchEmployees()
  }, [refetchEmployees])

  // Subscribe to real-time user updates
  useEffect(() => {
    if (!currentUser?.tenantId) return

    let unsubscribe = null

    const setupSubscription = async () => {
      try {
        unsubscribe = await pb
          .collection(PB_COLLECTIONS.users)
          .subscribe('*', () => {
            memoRefetch()
          })
      } catch (err) {
        console.error('Failed to subscribe to users:', err)
      }
    }

    setupSubscription()

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [currentUser?.tenantId, memoRefetch])

  const filteredEmployees = filterByRole(employees, roleFilter)
  const counts = countsByRole(employees)
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background text-foreground">
      {/* Sidebar - Rollen-Filter */}
      <SidebarRoles
        countsByRole={counts}
        activeRole={roleFilter}
        onSelectRole={setRoleFilter}
      />

      {/* Tabelle - Mitarbeiter */}
      <EmployeeTable
        employees={filteredEmployees}
        selectedId={selectedEmployeeId}
        onSelectRow={setSelectedEmployeeId}
        onInviteClick={() => setInviteDialogOpen(true)}
        onRoleChange={refetchEmployees}
        onLagerAssign={(empId) => {
          // TODO: Implement lager assignment modal
          console.log('Assign lager to:', empId)
        }}
      />

      {/* Detail-Panel */}
      <EmployeeDetail
        employee={selectedEmployee}
        onClose={() => setSelectedEmployeeId(null)}
        onChanged={refetchEmployees}
      />

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        tenantId={currentUser?.tenantId}
        onInviteSent={refetchEmployees}
      />
    </div>
  )
}
