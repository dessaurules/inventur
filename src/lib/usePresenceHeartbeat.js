import { useEffect, useRef } from 'react'
import { pb } from './pocketbase.js'
import { PB_COLLECTIONS } from './pocketbaseCollections.js'

const HEARTBEAT_MS = 45 * 1000
const USERS = PB_COLLECTIONS.users

/**
 * Schreibt bei gültiger Session `last_active_at` (Nutzer sieht sich in der Verwaltung als „online“).
 */
export function usePresenceHeartbeat(enabledUserId) {
  const intervalRef = useRef(null)

  useEffect(() => {
    const id = String(enabledUserId ?? '').trim()
    if (!id || !pb.authStore.token) return undefined

    const ping = async () => {
      if (!pb.authStore.token) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        await pb.collection(USERS).update(
          id,
          { last_active_at: new Date().toISOString() },
          { requestKey: 'presence-heartbeat' }
        )
      } catch {
        /* Feld fehlt o.Ä. — keine Störung der Oberfläche */
      }
    }

    void ping()
    intervalRef.current = window.setInterval(ping, HEARTBEAT_MS)

    const onVis = () => {
      if (document.visibilityState === 'visible') void ping()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabledUserId])
}
