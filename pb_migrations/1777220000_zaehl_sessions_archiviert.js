/// <reference path="../pb_data/types.d.ts" />
/**
 * Optionales Flag „archiviert“: Inventur in der Hauptliste ausblenden, unter Tab „Archiviert“ wiederfinden.
 */
migrate(
  (app) => {
    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    if (!zs.fields.getByName('archiviert')) {
      zs.fields.add(
        new Field({
          type: 'bool',
          name: 'archiviert',
          required: false,
        })
      )
    }
    app.save(zs)
  },
  (app) => {
    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    if (zs.fields.getByName('archiviert')) {
      zs.fields.removeByName('archiviert')
    }
    app.save(zs)
  }
)
