import { cn } from '../lib/cn.js'
import LagerverwaltungSection from './LagerverwaltungSection.jsx'

/**
 * Eigene App-Ansicht: Unternehmen, Lager/Unterlager, Nutzer-Zuweisungen.
 * Hülle wie Magazin/Inventuren: `magazin-variant-c`, Viewport-Höhe; Lagerliste zentral, Details rechts 380px.
 */
export default function LagerverwaltungPage({ readOnly = false, canAssignUsers = false }) {
  return (
    <div
      className={cn(
        'admin-view admin-page--magazin admin-page--lagerverwaltung inventuren-page--wide magazin-variant-c',
        'flex h-[calc(100vh-3.5rem)] min-h-[480px] min-w-0 w-full flex-col bg-background text-foreground'
      )}
    >
      <LagerverwaltungSection readOnly={readOnly} canAssignUsers={canAssignUsers} />
    </div>
  )
}
