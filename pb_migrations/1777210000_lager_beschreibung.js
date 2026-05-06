/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const lager = app.findCollectionByNameOrId('lager')
    if (!lager.fields.getByName('beschreibung')) {
      lager.fields.add(
        new Field({
          type: 'text',
          name: 'beschreibung',
          required: false,
          min: 0,
          max: 2000,
        })
      )
      app.save(lager)
    }
  },
  (app) => {
    try {
      const lager = app.findCollectionByNameOrId('lager')
      if (lager.fields.getByName('beschreibung')) {
        lager.fields.removeByName('beschreibung')
        app.save(lager)
      }
    } catch {
      /* ignore */
    }
  }
)
