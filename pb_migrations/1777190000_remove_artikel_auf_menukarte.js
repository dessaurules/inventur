/// <reference path="../pb_data/types.d.ts" />
/**
 * Feld `auf_menukarte` entfernen (Feature Menükarte eingestellt).
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    if (artikel.fields.getByName('auf_menukarte')) {
      artikel.fields.removeByName('auf_menukarte')
      app.save(artikel)
    }
  },
  (app) => {
    try {
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
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
