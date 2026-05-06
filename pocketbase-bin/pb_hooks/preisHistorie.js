/**
 * Gemeinsame Hilfen für artikel_preis_historie.pb.js (CommonJS für PocketBase JSVM).
 * @see https://pocketbase.io/docs/js-overview/#handlers-scope — Logik in Modul, Hooks requiren es.
 */
/* global Record */

function normPreis(v) {
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return 0
  return n
}

function preisIstGleich(a, b) {
  return Math.abs(normPreis(a) - normPreis(b)) < 1e-9
}

function appendPreisHistorie(app, artikelRecord, preisVorher, preisNachher, geaendertVonUserId) {
  const coll = app.findCollectionByNameOrId('artikel_preis_historie')
  const row = new Record(coll)
  row.set('artikel', artikelRecord.id)
  let tid = ''
  try {
    tid = artikelRecord.getString('tenant_id')
  } catch (_) {
    tid = ''
  }
  row.set('tenant_id', tid || '')
  if (preisVorher === null || preisVorher === undefined) {
    row.set('preis_vorher', null)
  } else {
    row.set('preis_vorher', normPreis(preisVorher))
  }
  row.set('preis_nachher', normPreis(preisNachher))
  if (geaendertVonUserId) {
    row.set('geaendert_von', String(geaendertVonUserId))
  }
  app.saveNoValidate(row)
}

function authUserIdFromHooksEvent(e) {
  try {
    const reqInfo = e.requestInfo
    if (!reqInfo) return ''
    const ri = typeof reqInfo === 'function' ? reqInfo() : reqInfo
    const auth = ri?.auth
    if (!auth) return ''
    const coll = auth.collection()
    if (!coll || coll.name !== 'users') return ''
    return auth.id || ''
  } catch (_) {
    return ''
  }
}

module.exports = {
  normPreis,
  preisIstGleich,
  appendPreisHistorie,
  authUserIdFromHooksEvent,
}
