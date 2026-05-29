/// <reference path="../pb_data/types.d.ts" />
/**
 * Artikel ohne Lager dem Standard-Lager (erstes, aktives) des Tenants zuweisen.
 */
migrate((app) => {
  // Für jeden Tenant/Standort: erstes Lager ermitteln, Artikel zuweisen
  try {
    const standorte = app.findAllRecords('standorte')

    for (const standort of standorte) {
      // Erstes aktives Lager mit sort_index
      let defaultLager = null
      let minIndex = Infinity

      try {
        const allLager = app.findAllRecords('lager')
        for (const lager of allLager) {
          if (
            lager.getString('standort') === standort.id &&
            lager.getBool('aktiv') === true
          ) {
            const sortIndex = lager.getNumber('sort_index') || 0
            if (sortIndex < minIndex || (sortIndex === minIndex && (!defaultLager || lager.id < defaultLager.id))) {
              minIndex = sortIndex
              defaultLager = lager
            }
          }
        }
      } catch (e) {
        // Lager nicht vorhanden
        continue
      }

      if (!defaultLager) continue

      // Alle Artikel ohne Lager für diesen Tenant updaten
      try {
        const articlesWithoutLager = app.findAllRecords('artikel')
        for (const artikel of articlesWithoutLager) {
          if (
            artikel.getString('tenant_id') === standort.id &&
            (!artikel.getString('lager') || artikel.getString('lager') === '')
          ) {
            artikel.set('lager', defaultLager.id)
            app.save(artikel)
          }
        }
      } catch (e) {
        // Artikel nicht vorhanden
        continue
      }
    }
  } catch (e) {
    // Standorte nicht vorhanden
  }
})

