/**
 * @param {{ id?: string, isAdmin?: boolean } | null | undefined} user
 * @param {{ session_owner?: string | { id?: string } | null }} sessionRecord
 */
export function userCanEndZaehlSession(user, sessionRecord) {
  if (!user?.id || !sessionRecord) return false
  if (user.isAdmin) return true
  const raw = sessionRecord.session_owner
  const ownerId =
    typeof raw === 'string' && raw.trim()
      ? raw.trim()
      : raw && typeof raw === 'object' && raw.id
        ? String(raw.id).trim()
        : ''
  if (!ownerId) return false
  return ownerId === user.id
}
