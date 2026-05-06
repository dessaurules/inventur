/// <reference path="../pb_data/types.d.ts" />
/**
 * Menükarten-Flag für Magazin-Filter „Auf Menükarte“.
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    if (!artikel.fields.getByName('auf_menukarte')) {
      artikel.fields.add(
        new Field({
          type: 'bool',
          name: 'auf_menukarte',
          required: false,
          presentable: true,
        })
      )
    }
    app.save(artikel)
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      if (artikel.fields.getByName('auf_menukarte')) {
        artikel.fields.removeByName('auf_menukarte')
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
