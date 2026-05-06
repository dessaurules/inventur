import MitarbeiterVerwaltenSection from './MitarbeiterVerwaltenSection.jsx'

/**
 * Admin: Mitarbeiter, Rollen, Einladungen — einheitliche Tabelle + Detail-Panel.
 */
export default function MitarbeiterView() {
  return (
    <div className="admin-view admin-page--mitarbeiter inventuren-page--wide flex min-h-0 w-full min-w-0 flex-1 flex-col text-foreground">
      <MitarbeiterVerwaltenSection />
    </div>
  )
}
