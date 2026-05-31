import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InventurenShell } from './inventuren-shell.jsx'

/**
 * Inventurenseite (Backend Admin-Interface).
 * 3-Spalten-Layout: Sidebar (Lager-Filter) | Tabelle | Detail-Panel
 */
export default function InventurenPage(props) {
  const client = useMemo(() => new QueryClient(), [])
  return (
    <QueryClientProvider client={client}>
      <InventurenShell {...props} />
    </QueryClientProvider>
  )
}
