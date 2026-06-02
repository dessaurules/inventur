/// <reference path="../pb_data/types.d.ts" />
/**
 * Korrigiert falsche Lager-ID in artikel.
 * Migration 1780300000 hat Artikel der alten ID 'c5e3f226j7agr0t' zugewiesen,
 * die nicht mehr existiert. Alle betroffenen Artikel werden dem echten Restaurant-Lager
 * ('cpsoatxh5vnziur') zugewiesen.
 */
migrate((app) => {
  const OLD_ID = 'c5e3f226j7agr0t'

  // Existiert das alte Lager noch? Dann nichts tun.
  try {
    app.findRecordById('lager', OLD_ID)
    return
  } catch {
    // Lager existiert nicht mehr → korrigieren
  }

  // Erstes aktives Lager als Ziel ermitteln
  let targetLager = null
  try {
    const all = app.findAllRecords('lager')
    for (const l of all) {
      if (l.getBool('aktiv') !== false) {
        if (!targetLager || l.getNumber('sort_index') < targetLager.getNumber('sort_index')) {
          targetLager = l
        }
      }
    }
  } catch {}

  if (!targetLager) return

  app.db()
    .newQuery(`UPDATE artikel SET lager = '${targetLager.id}' WHERE lager = '${OLD_ID}'`)
    .execute()
})
