/** Als „online“ gelten Nutzer, deren App zuletzt innerhalb dieses Fensters Heartbeat gesendet hat. */
export const USER_PRESENCE_ONLINE_MS = 3 * 60 * 1000

/**
 * @param {string | null | undefined} lastActiveAt PocketBase `date` als ISO-String
 * @param {number} [now]
 */
export function isUserPresenceOnline(lastActiveAt, now = Date.now()) {
  if (lastActiveAt == null || lastActiveAt === '') return false
  const t = new Date(lastActiveAt).getTime()
  if (!Number.isFinite(t)) return false
  return now - t <= USER_PRESENCE_ONLINE_MS
}
