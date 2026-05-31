import { useEffect, useState } from 'react'
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
    queryKey: ['mitarbeiter', currentUser?.tenant_id],
    queryFn: async () => {
      if (!currentUser?.tenant_id) return []
      try {
        const records = await pb.collection(PB_COLLECTIONS.users).getFullList({
          filter: `tenant_id = "${currentUser.tenant_id}"`,
          sort: '-created',
        })
        return records.map(mapPbRecordToEmployee)
      } catch (err) {
        console.error('Error fetching employees:', err)
        return []
      }
    },
    enabled: !!currentUser?.tenant_id,
  })

  // Subscribe to real-time user updates
  useEffect(() => {
    if (!currentUser?.tenant_id) return

    const unsubscribe = pb
      .collection(PB_COLLECTIONS.users)
      .subscribe('*', async () => {
        await refetchEmployees()
      })

    return () => {
      unsubscribe()
    }
  }, [currentUser?.tenant_id, refetchEmployees])

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
        tenantId={currentUser?.tenant_id}
        onInviteSent={refetchEmployees}
      />
    </div>
  )
}
