/**
 * PocketBase Collection-Namen (Dashboard + Migration pb_migrations).
 * Optional per VITE_* überschreiben.
 */
export const PB_COLLECTIONS = {
  users: import.meta.env.VITE_POCKETBASE_USERS_COLLECTION || 'users',
  userInvites:
    import.meta.env.VITE_POCKETBASE_USER_INVITES_COLLECTION || 'user_invites',
  artikel:
    import.meta.env.VITE_POCKETBASE_ARTICLES_COLLECTION ||
    import.meta.env.VITE_POCKETBASE_ARTIKEL_COLLECTION ||
    'artikel',
  artikelPreisHistorie:
    import.meta.env.VITE_POCKETBASE_ARTIKEL_PREIS_HISTORIE || 'artikel_preis_historie',
  zaehlSessions:
    import.meta.env.VITE_POCKETBASE_ZAEHL_SESSIONS || 'zaehl_sessions',
  zaehlungAktuell:
    import.meta.env.VITE_POCKETBASE_ZAEHLUNG_AKTUELL || 'zaehlung_aktuell',
  inventurArchiv:
    import.meta.env.VITE_POCKETBASE_INVENTUR_ARCHIV || 'inventur_archiv',
  standorte: import.meta.env.VITE_POCKETBASE_STANDORTE || 'standorte',
  lager: import.meta.env.VITE_POCKETBASE_LAGER || 'lager',
  unterlager: import.meta.env.VITE_POCKETBASE_UNTERLAGER || 'unterlager',
  userUnterlager: import.meta.env.VITE_POCKETBASE_USER_UNTERLAGER || 'user_unterlager',
}
