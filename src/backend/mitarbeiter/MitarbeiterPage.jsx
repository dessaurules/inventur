import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MitarbeiterShell } from './mitarbeiter-shell.jsx'

/**
 * Mitarbeiter-Verwaltung (Admin-Seite).
 * 3-Spalten-Layout: Sidebar (Rollen-Filter) | Tabelle | Detail-Panel
 */
export default function MitarbeiterPage(props) {
  const client = useMemo(() => new QueryClient(), [])
  return (
    <QueryClientProvider client={client}>
      <MitarbeiterShell {...props} />
    </QueryClientProvider>
  )
}
