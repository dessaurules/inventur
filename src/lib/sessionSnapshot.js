import { rowKeyForItem } from './articleRowKey'
import { mapPbRecordToArticle } from './pocketbase'
import { PB_COLLECTIONS } from './pocketbaseCollections'
import { fetchZaehlungAggregatedSumsByRowKey } from './zaehlungPosition'

function escapePbFilterToken(s) {
  return String(s ?? '').replace(/"/g, '\\"')
}

/** Eine Positionszeile wie `buildSessionPositionen`, mit explizitem Lager-Kontext pro Zeile. */
function snapshotRowForItem(item, gezaehlte_menge, meta = {}) {
  const {
    unterlagerId = null,
    lagerId = null,
    unterlagerName = '',
    lagerName = '',
  } = meta
  return {
    artikel_id: item.id,
    artikelnummer: item.artikelnummer ?? '',
    name: item.name ?? '',
    preis: item.preis ?? 0,
    einheit: item.einheit ?? '',
    category: item.category ?? '',
    createdAt: item.createdAt ?? null,
    gezaehlte_menge: Math.round(gezaehlte_menge * 100) / 100,
    unterlager_id: unterlagerId,
    lager_id: lagerId,
    unterlager_name: unterlagerName,
    lager_name: lagerName,
  }
}

/**
 * Lädt `zaehl_scope` → Lager-Kontext (u:… / l:… / leer = Session-Default).
 */
async function buildScopeMetaMap(pb, distinctScopes, sessionLagerMeta) {
  const emptyMeta = {
    unterlagerId: sessionLagerMeta.unterlagerId ?? null,
    lagerId: sessionLagerMeta.lagerId ?? null,
    unterlagerName: String(sessionLagerMeta.unterlagerName ?? ''),
    lagerName: String(sessionLagerMeta.lagerName ?? ''),
  }
  const metaByScope = new Map()
  metaByScope.set('', emptyMeta)

  const scopes = [...distinctScopes].map((s) => String(s ?? '').trim())
  const ulIds = [
    ...new Set(
      scopes.filter((s) => s.startsWith('u:')).map((s) => s.slice(2).trim()).filter(Boolean)
    ),
  ]
  const lagerIds = [
    ...new Set(
      scopes.filter((s) => s.startsWith('l:')).map((s) => s.slice(2).trim()).filter(Boolean)
    ),
  ]

  const ulById = new Map()
  if (ulIds.length) {
    try {
      const filter = ulIds.map((id) => `id="${escapePbFilterToken(id)}"`).join(' || ')
      const list = await pb.collection(PB_COLLECTIONS.unterlager).getFullList({
        filter: `(${filter})`,
        expand: 'lager',
        requestKey: null,
      })
      for (const ul of list) ulById.set(ul.id, ul)
    } catch {
      /* ignore */
    }
  }

  const lagerById = new Map()
  if (lagerIds.length) {
    try {
      const filter = lagerIds.map((id) => `id="${escapePbFilterToken(id)}"`).join(' || ')
      const list = await pb.collection(PB_COLLECTIONS.lager).getFullList({
        filter: `(${filter})`,
        requestKey: null,
      })
      for (const lg of list) lagerById.set(lg.id, lg)
    } catch {
      /* ignore */
    }
  }

  for (const sc of scopes) {
    if (metaByScope.has(sc)) continue
    if (!sc) {
      metaByScope.set(sc, emptyMeta)
      continue
    }
    if (sc.startsWith('u:')) {
      const id = sc.slice(2).trim()
      const ul = ulById.get(id)
      if (ul) {
        const lg = ul.expand?.lager
        const lId =
          (typeof ul.lager === 'string' ? ul.lager : ul.lager?.id) ?? lg?.id ?? null
        metaByScope.set(sc, {
          unterlagerId: ul.id,
          lagerId: lId,
          unterlagerName: String(ul.name ?? ''),
          lagerName: lg?.name ? String(lg.name) : '',
        })
      } else {
        metaByScope.set(sc, {
          unterlagerId: id,
          lagerId: null,
          unterlagerName: '',
          lagerName: '',
        })
      }
      continue
    }
    if (sc.startsWith('l:')) {
      const id = sc.slice(2).trim()
      const lg = lagerById.get(id)
      metaByScope.set(sc, {
        unterlagerId: null,
        lagerId: id,
        unterlagerName: '',
        lagerName: lg ? String(lg.name ?? '') : '',
      })
      continue
    }
    metaByScope.set(sc, emptyMeta)
  }
  return metaByScope
}

/**
 * Eine Zeile pro `zaehlung_aktuell`-Scope (statt alles zur Session-Unterlager-Zeile zusammenzufassen).
 * `merged` enthält die finale Menge pro Artikel (inkl. UI-Override); Anteile werden proportional auf die Scopes verteilt.
 */
async function resolvePositionenDetailFromZaehlung(pb, sessionId, items, merged, lagerMeta) {
  let rawRows = []
  try {
    rawRows = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).getFullList({
      filter: `session = "${escapePbFilterToken(sessionId)}"`,
      requestKey: null,
    })
  } catch {
    rawRows = []
  }
  if (!rawRows.length) {
    return buildSessionPositionen(items, merged, lagerMeta)
  }

  const byArtikel = new Map()
  const scopes = new Set([''])
  for (const r of rawRows) {
    const aid = typeof r.artikel === 'string' ? r.artikel : r.artikel?.id
    if (!aid) continue
    const sc = String(r.zaehl_scope ?? '').trim()
    scopes.add(sc)
    const m = Math.round((Number(r.menge) || 0) * 100) / 100
    const k = String(aid)
    if (!byArtikel.has(k)) byArtikel.set(k, [])
    const arr = byArtikel.get(k)
    const existing = arr.find((x) => x.scope === sc)
    if (existing) {
      existing.mengeDb = Math.round((existing.mengeDb + m) * 100) / 100
    } else {
      arr.push({ scope: sc, mengeDb: m })
    }
  }

  const scopeMeta = await buildScopeMetaMap(pb, scopes, lagerMeta)
  const out = []

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const rk = rowKeyForItem(item, idx)
    const T = merged[rk]
    if (T == null || !Number.isFinite(T) || T <= 0) continue

    const parts = byArtikel.get(String(item.id)) ?? []
    if (parts.length === 0) {
      out.push(snapshotRowForItem(item, T, lagerMeta))
      continue
    }

    const Sdb = parts.reduce((a, p) => a + Math.max(0, p.mengeDb), 0)
    if (Sdb <= 0) {
      out.push(snapshotRowForItem(item, T, lagerMeta))
      continue
    }

    const factor = T / Sdb
    let remaining = T
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      let m
      if (i === parts.length - 1) {
        m = Math.max(0, Math.round(remaining * 100) / 100)
      } else {
        m = Math.max(0, Math.round(p.mengeDb * factor * 100) / 100)
        remaining = Math.round((remaining - m) * 100) / 100
      }
      if (m <= 0) continue
      const meta = scopeMeta.get(p.scope) ?? scopeMeta.get('') ?? lagerMeta
      out.push(snapshotRowForItem(item, m, meta))
    }
  }

  return out
}

/**
 * Snapshot für `zaehl_sessions.positionen` (JSON-Array): je Artikel alle Felder + gezählte Menge.
 */
/**
 * @param {{ unterlagerId?: string | null, lagerId?: string | null, unterlagerName?: string, lagerName?: string }} [meta]
 */
export function buildSessionPositionen(items, quantitiesByRowKey, meta = {}) {
  const {
    unterlagerId = null,
    lagerId = null,
    unterlagerName = '',
    lagerName = '',
  } = meta
  return items.map((item, index) => {
    const rowKey = rowKeyForItem(item, index)
    const gezaehlte_menge = Number(quantitiesByRowKey[rowKey] ?? 0) || 0
    return {
      artikel_id: item.id,
      artikelnummer: item.artikelnummer ?? '',
      name: item.name ?? '',
      preis: item.preis ?? 0,
      einheit: item.einheit ?? '',
      category: item.category ?? '',
      createdAt: item.createdAt ?? null,
      gezaehlte_menge: Math.round(gezaehlte_menge * 100) / 100,
      unterlager_id: unterlagerId,
      lager_id: lagerId,
      unterlager_name: unterlagerName,
      lager_name: lagerName,
    }
  })
}

/**
 * Robuster Snapshot beim „Fertig“: Artikel aus React-State, falls leer aus PocketBase;
 * Mengen aus `zaehlung_aktuell` und aus der UI (UI überschreibt PB).
 */
/**
 * @param {{ skipUiMerge?: boolean }} [options] skipUiMerge: Zähler-App mit Lager-Scopes — nur PB-Summen (kein UI-Partial).
 */
export async function resolvePositionenForSessionEnd(
  pb,
  sessionId,
  itemsFromState,
  getPositionenForClose,
  options = {}
) {
  let lagerMeta = {}
  if (sessionId) {
    try {
      const sess = await pb.collection(PB_COLLECTIONS.zaehlSessions).getOne(sessionId, {
        expand: 'unterlager.lager',
        requestKey: null,
      })
      const ul = sess.expand?.unterlager
      const lg = ul?.expand?.lager
      const ulId =
        ul?.id ??
        (typeof sess.unterlager === 'string' ? sess.unterlager : sess.unterlager?.id) ??
        null
      const lId =
        (typeof ul?.lager === 'string' ? ul.lager : ul?.lager?.id) ?? lg?.id ?? null
      lagerMeta = {
        unterlagerId: ulId,
        lagerId: lId,
        unterlagerName: String(ul?.name ?? ''),
        lagerName: String(lg?.name ?? ''),
      }
    } catch {
      lagerMeta = {}
    }
  }

  let items = itemsFromState?.length ? itemsFromState : []
  if (!items.length) {
    try {
      const records = await pb.collection(PB_COLLECTIONS.artikel).getFullList({
        sort: 'name',
        requestKey: null,
      })
      items = records.map((r) => mapPbRecordToArticle(r)).filter((x) => x && x.name)
    } catch {
      items = []
    }
  }
  if (!sessionId || !items.length) return []

  const pbQuantities = await fetchZaehlungAggregatedSumsByRowKey(pb, sessionId, items)
  const merged = { ...pbQuantities }

  if (!options.skipUiMerge && typeof getPositionenForClose === 'function') {
    try {
      const uiRows = getPositionenForClose(items) || []
      for (const row of uiRows) {
        const aid = row?.artikel_id
        if (aid == null) continue
        const idx = items.findIndex((it) => String(it.id) === String(aid))
        if (idx < 0) continue
        const rk = rowKeyForItem(items[idx], idx)
        const m = Number(row.gezaehlte_menge)
        if (Number.isFinite(m)) merged[rk] = Math.round(m * 100) / 100
      }
    } catch {
      /* ignore */
    }
  }

  return resolvePositionenDetailFromZaehlung(pb, sessionId, items, merged, lagerMeta)
}

/** Liest `positionen` aus PB/Cached Records (String, doppelt kodiert, einzelnes Objekt …). */
export function normalizeSessionPositionen(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.filter((x) => x != null)
  if (typeof raw === 'string') {
    let s = raw.trim()
    if (!s) return []
    try {
      let p = JSON.parse(s)
      if (typeof p === 'string') {
        try {
          p = JSON.parse(p)
        } catch {
          return []
        }
      }
      return normalizeSessionPositionen(p)
    } catch {
      return []
    }
  }
  if (typeof raw === 'object') {
    if (raw.positionen != null) return normalizeSessionPositionen(raw.positionen)
    const vals = Object.values(raw)
    if (
      vals.length > 0 &&
      vals.every((v) => v && typeof v === 'object' && !Array.isArray(v))
    ) {
      return vals
    }
    if (raw.artikel_id != null || raw.name != null || raw.gezaehlte_menge != null) {
      return [raw]
    }
  }
  return []
}
