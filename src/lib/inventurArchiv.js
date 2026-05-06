import { pocketBaseFullErrorMessage } from './pocketBaseErrorMessage'
import { PB_COLLECTIONS } from './pocketbaseCollections'

/** Je Position im Archiv-JSON: Stammdaten aus dem Zählsnapshot + gezählte Menge. */
function archivPositionRow(row) {
  const groesseRaw = row?.groesse ?? row?.größe ?? row?.grosse ?? ''
  let preis = Number(row?.preis)
  if (!Number.isFinite(preis)) preis = 0
  let menge = Number(row?.gezaehlte_menge)
  if (!Number.isFinite(menge)) menge = 0
  menge = Math.round(menge * 100) / 100
  const uId = String(row?.unterlager_id ?? '').trim()
  const uN = String(row?.unterlager_name ?? '').trim()
  const lId = String(row?.lager_id ?? '').trim()
  const lN = String(row?.lager_name ?? '').trim()
  const out = {
    artikelnummer: String(row?.artikelnummer ?? '').trim(),
    name: String(row?.name ?? '').trim() || '—',
    preis,
    einheit: String(row?.einheit ?? '').trim(),
    groesse: String(groesseRaw ?? '').trim(),
    category: String(row?.category ?? '').trim(),
    gezaehlte_menge: menge,
  }
  if (uId) out.unterlager_id = uId
  if (uN) out.unterlager_name = uN
  if (lId) out.lager_id = lId
  if (lN) out.lager_name = lN
  return out
}

/**
 * Eine abgeschlossene Inventur = **ein** Archiv-Datensatz.
 * `inventur_id` entspricht der `zaehl_sessions`-Id (Abruf im Backend z. B. per Filter oder Record-`id`).
 * `positionen`: nur Zeilen mit gezählter Menge &gt; 0; pro Zeile u. a. artikelnummer, name, preis, einheit, category, gezaehlte_menge (optional legacy: groesse).
 */
export async function archiveCountedPositionsToInventurArchiv(pb, inventurId, abgeschlossenAm, positionen) {
  if (!inventurId || !abgeschlossenAm) return { ok: true, skipped: true, errors: [] }

  const rows = (positionen || [])
    .filter((row) => Number(row?.gezaehlte_menge) > 0)
    .map((row) => archivPositionRow(row))

  if (!rows.length) return { ok: true, skipped: true, errors: [] }

  const invId = String(inventurId).slice(0, 64)
  const summeGezaehlt =
    Math.round(rows.reduce((acc, r) => acc + r.gezaehlte_menge, 0) * 100) / 100
  let titel = `Inventur ${new Date(abgeschlossenAm).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
  titel = titel.slice(0, 500)
  let payload
  try {
    payload = JSON.parse(
      JSON.stringify({
        inventur_id: invId,
        abgeschlossen_am: abgeschlossenAm,
        positionen: rows,
        name: titel,
        gezaehlte_menge: summeGezaehlt > 0 ? summeGezaehlt : rows.length,
      })
    )
  } catch {
    return {
      ok: false,
      skipped: false,
      errors: ['Archiv-Daten konnten nicht serialisiert werden.'],
    }
  }

  try {
    await pb.collection(PB_COLLECTIONS.inventurArchiv).create(payload, { requestKey: null })
    return { ok: true, skipped: false, errors: [] }
  } catch (e) {
    const status = e?.status ?? e?.response?.status
    const hint403 =
      status === 403 || status === 401
        ? ' Collection „inventur_archiv“: Create für Gäste erlauben.'
        : ''
    const hintJson =
      ' Falls „positionen“ unbekannt: in PocketBase JSON-Feld **positionen** anlegen oder Migration `1775400000_inventur_archiv_positionen.js` ausführen.'
    const msg = `${pocketBaseFullErrorMessage(e)}${hint403}${hintJson}`
    return { ok: false, skipped: false, errors: [msg] }
  }
}
