import { rowKeyForItem } from './articleRowKey'
import { PB_COLLECTIONS } from './pocketbaseCollections'

function isLikelyUniqueConflict(e) {
  const status = e?.status ?? e?.response?.status ?? e?.originalError?.status ?? 0
  const msg = String(e?.response?.message || e?.message || e?.data?.message || '').toLowerCase()
  return (
    (status === 400 || status === 409) &&
    (msg.includes('unique') ||
      msg.includes('already exists') ||
      msg.includes('duplicate') ||
      msg.includes('must be unique'))
  )
}

/**
 * Summiert alle Zählpositionen (alle zaehl_scope) pro Artikel → rowKey → Summe.
 */
export async function fetchZaehlungAggregatedSumsByRowKey(pb, sessionId, items) {
  if (!sessionId || !items?.length) return {}
  const rows = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getFullList({
    filter: `session = "${sessionId}"`,
    requestKey: null,
  })
  const sumByArtikel = new Map()
  for (const p of rows) {
    const aid = typeof p.artikel === 'string' ? p.artikel : p.artikel?.id
    if (!aid) continue
    const m = Math.round((Number(p.menge) || 0) * 100) / 100
    const k = String(aid)
    sumByArtikel.set(k, (sumByArtikel.get(k) || 0) + m)
  }
  const map = {}
  for (const [aid, total] of sumByArtikel) {
    const idx = items.findIndex((it) => String(it.id) === aid)
    if (idx < 0) continue
    const rk = rowKeyForItem(items[idx], idx)
    map[rk] = Math.round(total * 100) / 100
  }
  return map
}

/**
 * Zählpositionen als Map rowKey → menge.
 * @param {string} [zaehlScope] Leer = alle Scopes summiert; sonst exakt "l:…" / "u:…" / "" für Legacy-Zeile.
 */
export async function fetchZaehlungQuantitiesByRowKey(pb, sessionId, items, zaehlScope) {
  if (!sessionId || !items?.length) return {}
  const scope = String(zaehlScope ?? '').trim()
  if (!scope) {
    return fetchZaehlungAggregatedSumsByRowKey(pb, sessionId, items)
  }
  const esc = scope.replace(/"/g, '\\"')
  const rows = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getFullList({
    filter: `session = "${sessionId}" && zaehl_scope = "${esc}"`,
    requestKey: null,
  })
  const map = {}
  for (const p of rows) {
    const aid = typeof p.artikel === 'string' ? p.artikel : p.artikel?.id
    if (!aid) continue
    const idx = items.findIndex((it) => String(it.id) === String(aid))
    if (idx < 0) continue
    const rk = rowKeyForItem(items[idx], idx)
    map[rk] = Math.round((Number(p.menge) || 0) * 100) / 100
  }
  return map
}

/**
 * Speichert eine Zählposition (Create oder Update). Toleriert Wettlauf um den Unique-Index.
 * @param {string} [zaehlScope] "" = Mandanten-/Legacy-Zeile; "l:…" / "u:…" = Zähler-App pro Lager.
 */
export async function upsertZaehlungPosition(pb, sessionId, artikelId, menge, zaehlScope = '') {
  if (!sessionId || !artikelId || menge == null) return
  const scope = String(zaehlScope ?? '').trim()
  const esc = scope.replace(/"/g, '\\"')
  const n = Math.round(Number(menge) * 100) / 100

  const findExisting = async () => {
    try {
      if (scope) {
        const { items: rows } = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getList(1, 1, {
          filter: `session = "${sessionId}" && artikel = "${artikelId}" && zaehl_scope = "${esc}"`,
          requestKey: null,
        })
        return rows[0] ?? null
      }
      const { items: rows } = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getList(1, 80, {
        filter: `session = "${sessionId}" && artikel = "${artikelId}"`,
        requestKey: null,
      })
      return (
        rows.find((r) => !String(r.zaehl_scope ?? '').trim()) ?? rows[0] ?? null
      )
    } catch {
      return null
    }
  }

  let existing = await findExisting()
  if (existing && n === 0) {
    await pb.collection(PB_COLLECTIONS.zaehlungAktuell).delete(existing.id)
    return
  }
  if (existing) {
    await pb.collection(PB_COLLECTIONS.zaehlungAktuell).update(existing.id, { menge: n })
    return
  }

  if (n === 0) return

  try {
    await pb.collection(PB_COLLECTIONS.zaehlungAktuell).create({
      session: sessionId,
      artikel: artikelId,
      menge: n,
      zaehl_scope: scope,
    })
  } catch (e) {
    if (!isLikelyUniqueConflict(e)) throw e
    existing = await findExisting()
    if (existing) {
      await pb.collection(PB_COLLECTIONS.zaehlungAktuell).update(existing.id, { menge: n })
      return
    }
    throw e
  }
}

/**
 * „Alle Lager“-Ansicht: gewünschte Gesamtmenge pro Artikel; Summe aus allen zaehl_scope-Zeilen.
 * Speichert den Anteil auf `zaehl_scope: ""`, sodass Summe = desiredTotal (Rest bleibt auf Unterlager-Zeilen).
 */
export async function upsertZaehlungAggregateTotal(pb, sessionId, artikelId, desiredTotal) {
  if (!sessionId || !artikelId || desiredTotal == null) return
  const T = Math.max(0, Math.round(Number(desiredTotal) * 100) / 100)
  const rows = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getFullList({
    filter: `session = "${sessionId}" && artikel = "${artikelId}"`,
    requestKey: null,
  })
  if (T === 0) {
    for (const row of rows) {
      await pb.collection(PB_COLLECTIONS.zaehlungAktuell).delete(row.id)
    }
    return
  }
  let sOther = 0
  for (const p of rows) {
    const sc = String(p.zaehl_scope ?? '').trim()
    if (sc === '') continue
    sOther += Math.round((Number(p.menge) || 0) * 100) / 100
  }
  sOther = Math.round(sOther * 100) / 100
  const mEmpty = Math.max(0, Math.round((T - sOther) * 100) / 100)
  return upsertZaehlungPosition(pb, sessionId, artikelId, mEmpty, '')
}

/** Alle Zählpositionen einer Session entfernen (z. B. nach „Fertig“). */
export async function deleteZaehlungPositionsForSession(pb, sessionId) {
  if (!sessionId) return
  const rows = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getFullList({
    filter: `session = "${sessionId}"`,
    requestKey: null,
  })
  for (const row of rows) {
    await pb.collection(PB_COLLECTIONS.zaehlungAktuell).delete(row.id)
  }
}
