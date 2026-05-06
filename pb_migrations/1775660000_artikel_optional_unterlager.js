/// <reference path="../pb_data/types.d.ts" />
/**
 * Optionales Unterlager pro Artikel (Filter nach Unterlager in der Zähler-App).
 * Voraussetzung: `unterlager`-Collection (Migration lager_hierarchie).
 */
migrate(
  (app) => {
    const unterlager = app.findCollectionByNameOrId('unterlager')
    const artikel = app.findCollectionByNameOrId('artikel')
    if (!artikel.fields.getByName('unterlager')) {
      artikel.fields.add(
        new Field({
          type: 'relation',
          name: 'unterlager',
          required: false,
          maxSelect: 1,
          collectionId: unterlager.id,
          cascadeDelete: false,
        })
      )
    }
    app.save(artikel)
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      if (artikel.fields.getByName('unterlager')) {
        artikel.fields.removeByName('unterlager')
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
