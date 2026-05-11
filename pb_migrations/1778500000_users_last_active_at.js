/// <reference path="../pb_data/types.d.ts" />

/**
 * Anwesenheit: von der App periodisch geschriebenes `last_active_at` (Nutzer-Verwaltung: Online/Offline).
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (users.fields.getByName('last_active_at')) return
    users.fields.add(
      new Field({
        type: 'date',
        name: 'last_active_at',
        required: false,
      })
    )
    app.save(users)
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users')
      if (users.fields.getByName('last_active_at')) {
        users.fields.removeByName('last_active_at')
        app.save(users)
      }
    } catch {
      /** */
    }
  }
)
