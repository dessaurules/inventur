import { avatarInitials } from './avatarInitials'
import { pb } from './pocketbase'
import { PB_COLLECTIONS } from './pocketbaseCollections'
import { formatUnterlagerLabel } from './lagerAccess'
import { normalizeSessionPositionen } from './sessionSnapshot'

/** @param {{ expand?: { session_owner?: Record<string, unknown> } } | undefined} session */
function erfasserFromSession(session) {
  const ex = session?.expand?.session_owner
  if (!ex) return { name: '—', initials: '—' }
  const fn = String(ex.first_name ?? '').trim()
  const ln = String(ex.last_name ?? '').trim()
  const name = [fn, ln].filter(Boolean).join(' ')
  const displayName = name || String(ex.email ?? '').trim() || '—'
  return {
    name: displayName,
    initials: avatarInitials(ex.first_name, ex.last_name, ex.email),
  }
}

export function sessionLagerMeta(session) {
  const ul = session.expand?.unterlager
  const id =
    ul?.id ??
    (typeof session.unterlager === 'string' ? session.unterlager : session.unterlager?.id) ??
    null
  const label = ul ? formatUnterlagerLabel(ul) || String(ul.name ?? '').trim() : ''
  return { unterlagerId: id, lagerLabel: label }
}

export function rowGesamtEuro(row) {
  const m = Number(row.gezaehlte_menge) || 0
  const p = Number(row.preis) || 0
  return Math.round(m * p * 100) / 100
}

/** Abgeschlossene Zählungen mit Positionen (Session-JSON oder Archiv). Sortierung: neuestes `ended` zuerst. */
export async function loadClosedInventurenWithRows() {
  const sessions = await pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
    sort: '-ended',
    expand: 'unterlager.lager,session_owner',
    requestKey: null,
  })
  const closed = sessions.filter((r) => Boolean(r.ended))
  const inventuren = await Promise.all(
    closed.map(async (session) => {
      let ended = session.ended
      const started = session.started ?? null
      const { unterlagerId, lagerLabel } = sessionLagerMeta(session)
      let rows = normalizeSessionPositionen(session.positionen)
      if (rows.length === 0) {
        try {
          const ar = await pb.collection(PB_COLLECTIONS.inventurArchiv).getFirstListItem(
            `inventur_id="${session.id}"`,
            { sort: '-abgeschlossen_am', requestKey: null }
          )
          rows = normalizeSessionPositionen(ar.positionen)
          if (rows.length) ended = ar.abgeschlossen_am ?? ended
        } catch {
          /* kein Archiv zu dieser Session */
        }
      }
      const tableRows = rows.filter((r) => Number(r?.gezaehlte_menge) > 0)
      return {
        id: session.id,
        ended,
        started,
        unterlagerId,
        lagerLabel,
        tableRows,
        erfasser: erfasserFromSession(session),
        archiviert: session.archiviert === true,
      }
    })
  )
  return inventuren
}
