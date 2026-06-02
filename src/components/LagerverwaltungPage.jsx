import LagerverwaltungSection from './LagerverwaltungSection.jsx'

/**
 * Eigene App-Ansicht: Unternehmen, Lager/Unterlager, Nutzer-Zuweisungen.
 * Hülle wie Magazin: Viewport-Höhe, volle Breite, kein Padding. Lagerliste zentral, Details rechts 380px.
 */
export default function LagerverwaltungPage({ readOnly = false, canAssignUsers = false }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[480px] min-w-0 w-full flex-col bg-background text-foreground">
      <LagerverwaltungSection readOnly={readOnly} canAssignUsers={canAssignUsers} />
    </div>
  )
}
