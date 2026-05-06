/// <reference path="../../pb_data/types.d.ts" />

/**
 * Regeln (Preis-Historie bei artikel):
 * 1) Nur in onRecordAfterUpdateSuccess schreiben — nie in onRecordUpdateRequest (sonst generischer 400/500).
 * 2) Neuen Preis immer per findRecordById nachladen — e.record ist nach dem Update nicht zuverlässig.
 * 3) Drift-Fallback: Wenn original() fälschlich „keine Änderung“ meldet, gewinnt die letzte preis_nachher
 *    aus der Historie (sofern sie vom aus DB geladenen neuen Preis abweicht).
 *
 * Create: onRecordAfterCreateSuccess (erste Zeile).
 *
 * Wichtig: PocketBase bündelt .pb.js zu pb.js — keine file-scope-Hilfsfunktionen, die von Handlern
 * aufgerufen werden (ReferenceError: … is not defined). Prüfungen als lokale Funktion im Handler.
 */

onBootstrap((e) => {
  e.next()
  console.log('[preis_hist] Bootstrap: Hooks geladen (Preis-Historie für artikel)')
  e.app.logger().info('[preis_hist] Hooks registriert (artikel_preis_historie.pb.js)')
})

onRecordAfterCreateSuccess((e) => {
  function eventIsArtikel(ev) {
    try {
      if (ev.collection && ev.collection.name === 'artikel') return true
      const rec = ev.record
      if (rec && typeof rec.collection === 'function') {
        const c = rec.collection()
        if (c && c.name === 'artikel') return true
      }
    } catch (_) {}
    return false
  }
  if (!eventIsArtikel(e)) return e.next()

  try {
    const ph = require(`${__hooks}/preisHistorie.js`)
    const preis = ph.normPreis(e.record.getFloat('preis'))
    let uid = ''
    try {
      uid = ph.authUserIdFromHooksEvent(e) || ''
    } catch (_) {}
    ph.appendPreisHistorie(e.app, e.record, null, preis, uid || null)
    console.log('[preis_hist] nach Create artikel=' + e.record.id + ' preis=' + preis)
    e.app.logger().info('[preis_hist] nach Create: Historie-Zeile geschrieben artikel=' + e.record.id + ' preis=' + preis)
  } catch (err) {
    console.log('[preis_hist] FEHLER after create: ' + err)
    e.app.logger().error('[artikel_preis_historie] after create: ' + err)
  }
  return e.next()
})

onRecordAfterUpdateSuccess((e) => {
  function eventIsArtikel(ev) {
    try {
      if (ev.collection && ev.collection.name === 'artikel') return true
      const rec = ev.record
      if (rec && typeof rec.collection === 'function') {
        const c = rec.collection()
        if (c && c.name === 'artikel') return true
      }
    } catch (_) {}
    return false
  }
  if (!eventIsArtikel(e)) return e.next()

  const ph = require(`${__hooks}/preisHistorie.js`)
  const id = e.record.id
  let lastNachher = null
  try {
    const rows = e.app.findRecordsByFilter('artikel_preis_historie', 'artikel = "' + id + '"', '-created', 1, 0)
    const last = rows && rows[0]
    if (last) lastNachher = ph.normPreis(last.getFloat('preis_nachher'))
  } catch (err) {
    console.log('[preis_hist] WARN letzte Historie lesen: ' + err)
  }
  let savedRec
  let newP
  try {
    savedRec = e.app.findRecordById('artikel', id)
    newP = ph.normPreis(savedRec.getFloat('preis'))
  } catch (err) {
    console.log('[preis_hist] FEHLER findRecordById artikel (Historie übersprungen): ' + err)
    e.app.logger().error('[preis_hist] update: findRecordById fehlgeschlagen artikel=' + id)
    return e.next()
  }
  let oldP = null
  let oldOk = false
  try {
    const orig = e.record.original()
    if (orig) {
      oldP = ph.normPreis(orig.getFloat('preis'))
      oldOk = true
    }
  } catch (err) {
    console.log('[preis_hist] WARN original() preis: ' + err)
  }
  if (!oldOk && lastNachher != null) {
    oldP = lastNachher
    oldOk = true
  }
  if (!oldOk) {
    console.log('[preis_hist] KEIN Altpreis (weder original() noch letzte Historie) artikel=' + id + ' — keine Zeile geschrieben')
    e.app.logger().warn('[preis_hist] update: Altpreis unbekannt, Historie übersprungen artikel=' + id)
    return e.next()
  }
  if (ph.preisIstGleich(oldP, newP)) {
    if (lastNachher != null && !ph.preisIstGleich(lastNachher, newP)) {
      oldP = lastNachher
      console.log('[preis_hist] Drift-Korrektur: Altpreis aus Historie ' + oldP + ' → neu=' + newP + ' artikel=' + id)
      e.app.logger().info('[preis_hist] Drift-Korrektur artikel=' + id + ' ' + oldP + ' → ' + newP)
    } else {
      console.log('[preis_hist] übersprungen (AfterUpdate): Preis unverändert artikel=' + id + ' alt=' + oldP + ' neu=' + newP)
      return e.next()
    }
  }
  if (ph.preisIstGleich(oldP, newP)) {
    return e.next()
  }
  try {
    let uid = ''
    try {
      uid = ph.authUserIdFromHooksEvent(e) || ''
    } catch (_) {}
    ph.appendPreisHistorie(e.app, savedRec, oldP, newP, uid || null)
    console.log('[preis_hist] Historie geschrieben ' + oldP + ' → ' + newP + ' artikel=' + id)
    e.app.logger().info('[preis_hist] Historie-Zeile geschrieben artikel=' + id + ' ' + oldP + ' → ' + newP)
  } catch (err) {
    console.log('[preis_hist] FEHLER after update (Historie): ' + err)
    e.app.logger().error('[artikel_preis_historie] after update append: ' + err)
  }
  return e.next()
})
