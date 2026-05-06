/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('zaehl_sessions')
    if (col.fields.getByName('positionen')) return
    col.fields.add(
      new Field({
        name: 'positionen',
        type: 'json',
        required: false,
        /** PocketBase: maxSize in Bytes (JSON-Nutzlast). ~2 MiB. */
        maxSize: 2097152,
      })
    )
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('zaehl_sessions')
      if (col.fields.getByName('positionen')) {
        col.fields.removeByName('positionen')
        app.save(col)
      }
    } catch {
      /* */
    }
  }
)
