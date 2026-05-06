import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MagazinShell } from './magazin-shell.jsx'

/**
 * Magazin „Variante C“ (Master/Detail + ⌘K).
 * Hinweis: Dieses Projekt nutzt Vite statt Next.js — Pfade entsprechen `src/backend/magazin/`.
 */
export default function MagazinPage(props) {
  const client = useMemo(() => new QueryClient(), [])
  return (
    <QueryClientProvider client={client}>
      <MagazinShell {...props} />
    </QueryClientProvider>
  )
}
