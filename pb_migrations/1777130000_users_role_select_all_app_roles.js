/// <reference path="../pb_data/types.d.ts" />
/**
 * Select-Feld `users.role`: alle in der App genutzten Rollen + Legacy `users`,
 * damit im PocketBase-Admin (Backend) und in der App dieselben Werte wählbar sind.
 *
 * Vorher (z. B. Migration 1775208304): nur admin | users → Admin-UI konnte
 * lagerleiter / inventur / magazin_readonly nicht setzen.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const values = ['admin', 'lagerleiter', 'inventur', 'magazin_readonly', 'users']

    let roleField = users.fields.getByName('role')
    if (!roleField) {
      users.fields.add(
        new Field({
          type: 'select',
          name: 'role',
          required: false,
          maxSelect: 1,
          values,
        })
      )
    } else if (roleField.type === 'select') {
      roleField.values = values
    }

    app.save(users)
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users')
      const roleField = users.fields.getByName('role')
      if (roleField && roleField.type === 'select') {
        roleField.values = ['admin', 'users']
      }
      app.save(users)
    } catch {
      /* */
    }
  }
)
