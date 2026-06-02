/// <reference path="../pb_data/types.d.ts" />
/**
 * Setzt emailVisibility = true für alle bestehenden User.
 * Nur Admins können User listen (listRule), daher ist das sicher.
 * Ohne dieses Flag gibt PocketBase die E-Mail im API-Response nicht zurück.
 */
migrate((app) => {
  const records = app.findAllRecords('users')
  for (const record of records) {
    if (!record.getBool('emailVisibility')) {
      record.set('emailVisibility', true)
      app.save(record)
    }
  }
})
