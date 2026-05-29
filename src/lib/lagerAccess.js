import { PB_COLLECTIONS } from './pocketbaseCollections'
import { APP_ROLES, normalizeAppRole } from './userCapabilities'

/**
 * Alle Unterlager, die ein Nutzer zum Start einer Zählsession wählen darf.
 * Admin/Lagerleiter: alle aktiven Unterlager des Mandanten (tenant_id).
 * Rolle inventur: Unterlager der zugewiesenen Lager (user_lager).
 */
export async function fetchUnterlagerOptionsForZaehlen(pbClient, user) {
  if (!user?.id) return []
  const role = normalizeAppRole({
    role: user.role,
    is_admin: user.isAdmin,
  })
  const privileged =
    user.isAdmin ||
    role === APP_ROLES.admin ||
    role === APP_ROLES.lagerleiter ||
    !user.tenantId

  if (privileged && user.tenantId) {
    const list = await pbClient.collection(PB_COLLECTIONS.lager).getFullList({
      filter: `standort = "${user.tenantId}"`,
      sort: 'sort_index,name',
      requestKey: null,
    })
    const lagerIds = list.map((r) => r.id)
    if (lagerIds.length === 0) return []
    const or = lagerIds.map((id) => `lager = "${id}"`).join(' || ')
    const ul = await pbClient.collection(PB_COLLECTIONS.unterlager).getFullList({
      filter: `(${or})`,
      sort: 'sort_index,name',
      expand: 'lager',
      requestKey: null,
    })
    return ul.filter((r) => r.aktiv !== false)
  }

  if (privileged && !user.tenantId) {
    const ul = await pbClient.collection(PB_COLLECTIONS.unterlager).getFullList({
      sort: 'sort_index,name',
      expand: 'lager',
      requestKey: null,
    })
    return ul.filter((r) => r.aktiv !== false)
  }

  const lagerLinks = await pbClient.collection(PB_COLLECTIONS.userLager).getFullList({
    filter: `nutzer = "${user.id}"`,
    requestKey: null,
  })
  if (lagerLinks.length === 0) return []
  const or = lagerLinks.map((r) => `lager = "${r.lager}"`).join(' || ')
  const ul = await pbClient.collection(PB_COLLECTIONS.unterlager).getFullList({
    filter: `(${or})`,
    sort: 'sort_index,name',
    expand: 'lager',
    requestKey: null,
  })
  const out = ul.filter((u) => u.aktiv !== false)
  out.sort((a, b) => {
    const si = (a.sort_index ?? 0) - (b.sort_index ?? 0)
    if (si !== 0) return si
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de')
  })
  return out
}

export function formatUnterlagerLabel(u) {
  if (!u) return ''
  const l = u.expand?.lager
  const ln = l?.name ? String(l.name) : ''
  const un = String(u.name ?? '')
  return ln ? `${ln} → ${un}` : un
}

/** Nur Unterlager-Name ohne Lager-Präfix (z. B. Zählen-Header-Dropdown). */
export function formatUnterlagerNameOnly(u) {
  if (!u) return ''
  return String(u.name ?? '').trim()
}

/**
 * Lager für die Auswahl während einer Zählsession (Filter „Alle Lager“ / ein Lager).
 * Rechte analog zu Unterlager-Optionen: privilegiert alle Lager des Mandanten bzw. alle;
 * Rolle inventur nur Lager über zugewiesene Unterlager.
 */
export async function fetchLagerOptionsForZaehlenFilter(pbClient, user) {
  if (!user?.id) return []
  const role = normalizeAppRole({
    role: user.role,
    is_admin: user.isAdmin,
  })
  const privileged =
    user.isAdmin ||
    role === APP_ROLES.admin ||
    role === APP_ROLES.lagerleiter ||
    !user.tenantId

  if (privileged && user.tenantId) {
    return pbClient.collection(PB_COLLECTIONS.lager).getFullList({
      filter: `standort = "${user.tenantId}"`,
      sort: 'sort_index,name',
      requestKey: null,
    })
  }

  if (privileged && !user.tenantId) {
    return pbClient.collection(PB_COLLECTIONS.lager).getFullList({
      sort: 'sort_index,name',
      requestKey: null,
    })
  }

  const ul = await fetchUnterlagerOptionsForZaehlen(pbClient, user)
  const byId = new Map()
  for (const u of ul) {
    const l = u.expand?.lager
    if (l?.id) byId.set(l.id, l)
  }
  return [...byId.values()].sort((a, b) => {
    const si = (a.sort_index ?? 0) - (b.sort_index ?? 0)
    if (si !== 0) return si
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de')
  })
}
