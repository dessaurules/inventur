/// <reference path="../pb_data/types.d.ts" />
/**
 * Erweitert Auth-Collection `users` (role, permissions, tenant_id, is_admin),
 * legt optional `standorte` an, fügt `tenant_id` auf fachlichen Collections hinzu
 * und setzt API-Rules (Rollen + Mandant).
 *
 * `verified` ist bei PocketBase-Auth bereits vorhanden (E-Mail-Bestätigung).
 *
 * Rollen: admin, lagerleiter, inventur, magazin_readonly.
 * Leeres role → wie lagerleiter (Abwärtskompatibilität).
 * Nur admin (role oder is_admin) darf Nutzer listen/anlegen/löschen.
 * inventur: Magazin nur lesen; magazin_readonly: kein Zugriff auf Zähl-Collections.
 */
migrate(
  (app) => {
    const openRules = {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }

    let standorte
    try {
      standorte = app.findCollectionByNameOrId('standorte')
    } catch {
      standorte = new Collection({
        type: 'base',
        name: 'standorte',
        ...openRules,
        fields: [
          {
            type: 'text',
            name: 'name',
            required: true,
            min: 1,
            max: 200,
          },
        ],
      })
      app.save(standorte)
      standorte = app.findCollectionByNameOrId('standorte')
    }

    const users = app.findCollectionByNameOrId('users')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new Field({
          type: 'select',
          name: 'role',
          required: false,
          maxSelect: 1,
          values: ['admin', 'lagerleiter', 'inventur', 'magazin_readonly'],
        })
      )
    }

    if (!users.fields.getByName('permissions')) {
      users.fields.add(
        new Field({
          type: 'json',
          name: 'permissions',
          required: false,
          maxSize: 100000,
        })
      )
    }

    if (!users.fields.getByName('tenant_id')) {
      users.fields.add(
        new Field({
          type: 'relation',
          name: 'tenant_id',
          required: false,
          maxSelect: 1,
          collectionId: standorte.id,
          cascadeDelete: false,
        })
      )
    }

    if (!users.fields.getByName('is_admin')) {
      users.fields.add(
        new Field({
          type: 'bool',
          name: 'is_admin',
          required: false,
        })
      )
    }

    app.save(users)

    const tenantRelationField = {
      type: 'relation',
      name: 'tenant_id',
      required: false,
      maxSelect: 1,
      collectionId: standorte.id,
      cascadeDelete: false,
    }

    const withTenant = ['artikel', 'zaehl_sessions', 'inventur_archiv', 'zaehlung_aktuell']
    for (const name of withTenant) {
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('tenant_id')) {
        col.fields.add(new Field(tenantRelationField))
        app.save(col)
      }
    }

    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"

    const magRead = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'magazin_readonly' || @request.auth.role = '')`
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`

    const artikelList = `${authOk} && ${tenantOk} && ${magRead}`
    const artikelWrite = `${authOk} && ${tenantOk} && ${magWrite}`
    const inventurAll = `${authOk} && ${tenantOk} && ${invCrud}`

    const artikel = app.findCollectionByNameOrId('artikel')
    artikel.listRule = artikelList
    artikel.viewRule = artikelList
    artikel.createRule = artikelWrite
    artikel.updateRule = artikelWrite
    artikel.deleteRule = artikelWrite
    app.save(artikel)

    for (const name of ['zaehl_sessions', 'zaehlung_aktuell']) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = inventurAll
      col.viewRule = inventurAll
      col.createRule = inventurAll
      col.updateRule = inventurAll
      col.deleteRule = inventurAll
      app.save(col)
    }

    const archiv = app.findCollectionByNameOrId('inventur_archiv')
    archiv.listRule = inventurAll
    archiv.viewRule = inventurAll
    archiv.createRule = inventurAll
    archiv.updateRule = inventurAll
    archiv.deleteRule = inventurAll
    app.save(archiv)

    standorte = app.findCollectionByNameOrId('standorte')
    standorte.listRule = `${authOk} && (${isAdmin} || id = @request.auth.tenant_id)`
    standorte.viewRule = standorte.listRule
    standorte.createRule = `${authOk} && ${isAdmin}`
    standorte.updateRule = standorte.createRule
    standorte.deleteRule = standorte.createRule
    app.save(standorte)

    users.listRule = `${authOk} && ${isAdmin}`
    users.viewRule = `${authOk} && (@request.auth.id = id || ${isAdmin})`
    users.createRule = `${authOk} && ${isAdmin}`
    users.updateRule = `${authOk} && (@request.auth.id = id || ${isAdmin})`
    users.deleteRule = `${authOk} && ${isAdmin}`
    app.save(users)
  },
  (app) => {
    const openRules = {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }

    for (const name of ['artikel', 'zaehl_sessions', 'zaehlung_aktuell', 'inventur_archiv']) {
      try {
        const col = app.findCollectionByNameOrId(name)
        Object.assign(col, openRules)
        if (col.fields.getByName('tenant_id')) {
          col.fields.removeByName('tenant_id')
        }
        app.save(col)
      } catch {
        /* */
      }
    }

    try {
      const users = app.findCollectionByNameOrId('users')
      Object.assign(users, openRules)
      if (users.fields.getByName('permissions')) {
        users.fields.removeByName('permissions')
      }
      if (users.fields.getByName('tenant_id')) {
        users.fields.removeByName('tenant_id')
      }
      app.save(users)
    } catch {
      /* */
    }

    try {
      app.delete(app.findCollectionByNameOrId('standorte'))
    } catch {
      /* */
    }
  }
)
