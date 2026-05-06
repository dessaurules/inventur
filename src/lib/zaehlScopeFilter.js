/**
 * Filtert Artikel für die Zähler-App (index.html).
 * scopeValue: '' | 'l:<lagerId>' | 'u:<unterlagerId>'
 * ulToLagerId: Map(unterlagerRecordId → parent lager id)
 */
export function filterItemsByZaehlScope(items, scopeValue, ulToLagerId) {
  if (!scopeValue || !items?.length) return items || []
  if (scopeValue.startsWith('l:')) {
    const lid = scopeValue.slice(2)
    return items.filter((it) => {
      if (String(it.lagerId || '') === lid) return true
      const uid = String(it.unterlagerId || '')
      if (uid && ulToLagerId?.get(uid) === lid) return true
      return false
    })
  }
  if (scopeValue.startsWith('u:')) {
    const uid = scopeValue.slice(2)
    return items.filter((it) => String(it.unterlagerId || '') === uid)
  }
  return items
}

export function buildUnterlagerToLagerIdMap(unterlagerRecords) {
  const m = new Map()
  if (!unterlagerRecords?.length) return m
  for (const u of unterlagerRecords) {
    if (!u?.id) continue
    const raw = u.lager
    let lid = ''
    if (typeof raw === 'string' && raw) lid = raw
    else if (raw && typeof raw === 'object' && raw.id) lid = String(raw.id)
    else if (u.expand?.lager?.id) lid = String(u.expand.lager.id)
    if (lid) m.set(String(u.id), lid)
  }
  return m
}
