/// <reference path="../pb_data/types.d.ts" />
/**
 * Lieferanten-Gebinde → Einzelpreis (preis bleibt Preis pro Zähleinheit):
 * - stueck_pro_liefergebinde: z. B. 12 bei Kasten 12×1l (Rechnungs-E-Preis ÷ dieser Wert = Einzelpreis)
 * - lieferanten_artnr: Nummer vom Lieferanten (PDF/EDI), optional für späteren Import-Abgleich
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    let changed = false
    if (!artikel.fields.getByName('stueck_pro_liefergebinde')) {
      artikel.fields.add(
        new Field({
          type: 'number',
          name: 'stueck_pro_liefergebinde',
          required: false,
          min: 1,
          max: 9999,
          onlyInt: true,
          presentable: false,
        })
      )
      changed = true
    }
    if (!artikel.fields.getByName('lieferanten_artnr')) {
      artikel.fields.add(
        new Field({
          type: 'text',
          name: 'lieferanten_artnr',
          required: false,
          min: 0,
          max: 64,
        })
      )
      changed = true
    }
    if (changed) app.save(artikel)
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      let changed = false
      if (artikel.fields.getByName('stueck_pro_liefergebinde')) {
        artikel.fields.removeByName('stueck_pro_liefergebinde')
        changed = true
      }
      if (artikel.fields.getByName('lieferanten_artnr')) {
        artikel.fields.removeByName('lieferanten_artnr')
        changed = true
      }
      if (changed) app.save(artikel)
    } catch {
      /* */
    }
  }
)
