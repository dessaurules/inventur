/// <reference path="../pb_data/types.d.ts" />
/**
 * Nachrüstung: Das Feld `archived` fehlt in der artikel-Collection
 * (Ursprungsmigration wurde als angewendet markiert, Feld aber nicht gespeichert).
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    if (!artikel.fields.getByName('archived')) {
      artikel.fields.add(
        new Field({
          type: 'bool',
          name: 'archived',
          required: false,
          presentable: false,
        })
      )
      app.save(artikel)
    }
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      if (artikel.fields.getByName('archived')) {
        artikel.fields.removeByName('archived')
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
