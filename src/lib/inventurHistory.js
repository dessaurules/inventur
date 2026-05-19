import { avatarInitials } from './avatarInitials'
import { pb } from './pocketbase'
import { PB_COLLECTIONS } from './pocketbaseCollections'
import { formatUnterlagerLabel } from './lagerAccess'
import { normalizeSessionPositionen } from './sessionSnapshot'

const ARCHIVE_FILTER_BATCH = 20

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

function escapeFilterId(id) {
  return String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Archiv-Einträge für viele Sessions in wenigen Requests (statt N× getFirstListItem). */
async function fetchArchivesByInventurIds(ids) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map()
  if (!ids.length) return map

  for (let i = 0; i < ids.length; i += ARCHIVE_FILTER_BATCH) {
    const chunk = ids.slice(i, i + ARCHIVE_FILTER_BATCH)
    const filter = chunk.map((id) => `inventur_id="${escapeFilterId(id)}"`).join(' || ')
    const rows = await pb.collection(PB_COLLECTIONS.inventurArchiv).getFullList({
      filter,
      sort: '-abgeschlossen_am',
      requestKey: null,
    })
    for (const ar of rows) {
      const key = String(ar.inventur_id ?? '')
      if (key && !map.has(key)) map.set(key, ar)
    }
  }
  return map
}

function closedSessionToInventur(session, archiveByInventurId) {
  let ended = session.ended
  const started = session.started ?? null
  const { unterlagerId, lagerLabel } = sessionLagerMeta(session)
  let rows = normalizeSessionPositionen(session.positionen)
  if (rows.length === 0) {
    const ar = archiveByInventurId.get(session.id)
    if (ar) {
      rows = normalizeSessionPositionen(ar.positionen)
      if (rows.length) ended = ar.abgeschlossen_am ?? ended
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
}

export async function fetchAllZaehlSessions() {
  return pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
    sort: '-started',
    expand: 'unterlager.lager,session_owner',
    requestKey: null,
  })
}

/** @param {Record<string, unknown>[]} sessions */
export async function closedInventurenFromSessions(sessions) {
  const closed = sessions.filter((r) => Boolean(r.ended))
  const needArchiveIds = closed
    .filter((s) => normalizeSessionPositionen(s.positionen).length === 0)
    .map((s) => s.id)
  const archiveByInventurId = await fetchArchivesByInventurIds(needArchiveIds)
  return closed
    .map((session) => closedSessionToInventur(session, archiveByInventurId))
    .sort((a, b) => {
      const ta = a.ended ? new Date(a.ended).getTime() : 0
      const tb = b.ended ? new Date(b.ended).getTime() : 0
      return tb - ta
    })
}

/** Ein Request für Sessions; offen + geschlossen aus derselben Liste. */
export async function loadInventurSessionLists() {
  const sessions = await fetchAllZaehlSessions()
  const closedInventuren = await closedInventurenFromSessions(sessions)
  const openSessions = sessions.filter((r) => !r.ended)
  return { closedInventuren, openSessions, sessions }
}

/** Abgeschlossene Zählungen mit Positionen (Session-JSON oder Archiv). Sortierung: neuestes `ended` zuerst. */
export async function loadClosedInventurenWithRows() {
  const sessions = await fetchAllZaehlSessions()
  return closedInventurenFromSessions(sessions)
}
