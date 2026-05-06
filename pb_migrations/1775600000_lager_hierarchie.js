/// <reference path="../pb_data/types.d.ts" />
/**
 * Lagerverwaltung: standorte (Unternehmen) um Anschrift/Logo erweitern,
 * lager → unterlager, user_unterlager (Zuweisung), zaehl_sessions.unterlager.
 * Artikel bleiben mandantenweit (tenant_id unverändert).
 */
migrate(
  (app) => {
    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const magRead = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'magazin_readonly' || @request.auth.role = '')`
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
    const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
    const tenantStandortMatch = `(@request.auth.tenant_id = '' || standort = @request.auth.tenant_id)`
    const tenantUnterlagerMatch = `(@request.auth.tenant_id = '' || unterlager.lager.standort = @request.auth.tenant_id)`

    const standorte = app.findCollectionByNameOrId('standorte')

    if (!standorte.fields.getByName('anschrift')) {
      standorte.fields.add(
        new Field({
          type: 'text',
          name: 'anschrift',
          required: false,
          min: 0,
          max: 2000,
        })
      )
    }
    if (!standorte.fields.getByName('logo')) {
      standorte.fields.add(
        new Field({
          type: 'file',
          name: 'logo',
          required: false,
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          thumbs: ['100x100'],
        })
      )
    }
    standorte.listRule = `${authOk} && (${isAdmin} || id = @request.auth.tenant_id)`
    standorte.viewRule = standorte.listRule
    standorte.createRule = `${authOk} && ${isAdmin}`
    standorte.updateRule = `${authOk} && (${isAdmin} || (@request.auth.role = 'lagerleiter' && id = @request.auth.tenant_id))`
    standorte.deleteRule = `${authOk} && ${isAdmin}`
    app.save(standorte)

    const users = app.findCollectionByNameOrId('users')

    let lager
    try {
      lager = app.findCollectionByNameOrId('lager')
    } catch {
      lager = new Collection({
        type: 'base',
        name: 'lager',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          {
            type: 'relation',
            name: 'standort',
            required: true,
            maxSelect: 1,
            collectionId: standorte.id,
            cascadeDelete: false,
          },
          {
            type: 'text',
            name: 'name',
            required: true,
            min: 1,
            max: 200,
          },
          {
            type: 'number',
            name: 'sort_index',
            required: false,
            min: 0,
            max: 999999,
          },
          {
            type: 'bool',
            name: 'aktiv',
            required: false,
          },
        ],
      })
      app.save(lager)
      lager = app.findCollectionByNameOrId('lager')
    }

    lager.listRule = `${authOk} && ${magRead} && ${tenantStandortMatch}`
    lager.viewRule = lager.listRule
    lager.createRule = `${authOk} && ${magWrite} && ${tenantStandortMatch}`
    lager.updateRule = lager.createRule
    lager.deleteRule = lager.createRule
    app.save(lager)

    let unterlager
    try {
      unterlager = app.findCollectionByNameOrId('unterlager')
    } catch {
      unterlager = new Collection({
        type: 'base',
        name: 'unterlager',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          {
            type: 'relation',
            name: 'lager',
            required: true,
            maxSelect: 1,
            collectionId: lager.id,
            cascadeDelete: true,
          },
          {
            type: 'text',
            name: 'name',
            required: true,
            min: 1,
            max: 200,
          },
          {
            type: 'number',
            name: 'sort_index',
            required: false,
            min: 0,
            max: 999999,
          },
          {
            type: 'bool',
            name: 'aktiv',
            required: false,
          },
        ],
      })
      app.save(unterlager)
      unterlager = app.findCollectionByNameOrId('unterlager')
    }

    const tenantLagerMatch = `(@request.auth.tenant_id = '' || lager.standort = @request.auth.tenant_id)`
    unterlager.listRule = `${authOk} && ${magRead} && ${tenantLagerMatch}`
    unterlager.viewRule = unterlager.listRule
    unterlager.createRule = `${authOk} && ${magWrite} && ${tenantLagerMatch}`
    unterlager.updateRule = unterlager.createRule
    unterlager.deleteRule = unterlager.createRule
    app.save(unterlager)

    let userUnterlager
    try {
      userUnterlager = app.findCollectionByNameOrId('user_unterlager')
    } catch {
      userUnterlager = new Collection({
        type: 'base',
        name: 'user_unterlager',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          {
            type: 'relation',
            name: 'nutzer',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            type: 'relation',
            name: 'unterlager',
            required: true,
            maxSelect: 1,
            collectionId: unterlager.id,
            cascadeDelete: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_user_unterlager_pair ON user_unterlager (nutzer, unterlager)',
        ],
      })
      app.save(userUnterlager)
      userUnterlager = app.findCollectionByNameOrId('user_unterlager')
    }

    const uuList = `${authOk} && (${isAdmin} || @request.auth.role = 'lagerleiter' || nutzer = @request.auth.id) && ${tenantUnterlagerMatch}`
    const uuWrite = `${authOk} && ${magWrite} && ${tenantUnterlagerMatch} && (nutzer.tenant_id = @request.auth.tenant_id || @request.auth.tenant_id = '')`
    userUnterlager.listRule = uuList
    userUnterlager.viewRule = uuList
    userUnterlager.createRule = uuWrite
    userUnterlager.updateRule = uuWrite
    userUnterlager.deleteRule = uuWrite
    app.save(userUnterlager)

    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    if (!zs.fields.getByName('unterlager')) {
      zs.fields.add(
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
    const zaehlUnterlagerOk = `(@request.auth.tenant_id = '' || unterlager.id = '' || unterlager.lager.standort = @request.auth.tenant_id)`
    zs.listRule = inventurAll
    zs.viewRule = inventurAll
    zs.createRule = `${inventurAll} && ${zaehlUnterlagerOk}`
    zs.updateRule = inventurAll
    zs.deleteRule = inventurAll
    app.save(zs)
  },
  (app) => {
    try {
      const zs = app.findCollectionByNameOrId('zaehl_sessions')
      if (zs.fields.getByName('unterlager')) {
        zs.fields.removeByName('unterlager')
        app.save(zs)
      }
    } catch {
      /* */
    }
    try {
      app.delete(app.findCollectionByNameOrId('user_unterlager'))
    } catch {
      /* */
    }
    try {
      app.delete(app.findCollectionByNameOrId('unterlager'))
    } catch {
      /* */
    }
    try {
      app.delete(app.findCollectionByNameOrId('lager'))
    } catch {
      /* */
    }
    try {
      const standorte = app.findCollectionByNameOrId('standorte')
      if (standorte.fields.getByName('logo')) standorte.fields.removeByName('logo')
      if (standorte.fields.getByName('anschrift')) standorte.fields.removeByName('anschrift')
      standorte.listRule = ''
      standorte.viewRule = ''
      standorte.createRule = ''
      standorte.updateRule = ''
      standorte.deleteRule = ''
      app.save(standorte)
    } catch {
      /* */
    }
  }
)
