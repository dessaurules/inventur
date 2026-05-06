/// <reference path="../pb_data/types.d.ts" />
/**
 * Optionales Lager pro Artikel – Filter „nur dieses Lager“ in der Zählsession.
 * Voraussetzung: Migration `lager_hierarchie` (Collection `lager`).
 */
migrate(
  (app) => {
    const lager = app.findCollectionByNameOrId('lager')
    const artikel = app.findCollectionByNameOrId('artikel')
    if (!artikel.fields.getByName('lager')) {
      artikel.fields.add(
        new Field({
          type: 'relation',
          name: 'lager',
          required: false,
          maxSelect: 1,
          collectionId: lager.id,
          cascadeDelete: false,
        })
      )
    }
    app.save(artikel)
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      if (artikel.fields.getByName('lager')) {
        artikel.fields.removeByName('lager')
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
