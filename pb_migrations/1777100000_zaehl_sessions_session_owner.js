/// <reference path="../pb_data/types.d.ts" />
/**
 * `zaehl_sessions.session_owner` → Ersteller; nur Owner + Admin dürfen die Session beenden (update).
 * Create: `session_owner` muss der aktuelle Nutzer sein.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const zs = app.findCollectionByNameOrId('zaehl_sessions')

    if (!zs.fields.getByName('session_owner')) {
      zs.fields.add(
        new Field({
          type: 'relation',
          name: 'session_owner',
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        })
      )
    }

    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
    const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
    const zaehlCreateUnterlagerOk = `(@request.auth.tenant_id = '' || @request.body.unterlager:isset = false || @request.body.unterlager = '' || unterlager.lager.standort = @request.auth.tenant_id)`
    const ownerOnCreate = `@request.body.session_owner = @request.auth.id`
    const ownerOrAdminUpdate = `(${isAdmin} || session_owner = @request.auth.id)`

    zs.createRule = `${inventurAll} && ${zaehlCreateUnterlagerOk} && ${ownerOnCreate}`
    zs.updateRule = `${inventurAll} && ${ownerOrAdminUpdate}`

    app.save(zs)
  },
  (app) => {
    try {
      const zs = app.findCollectionByNameOrId('zaehl_sessions')
      if (zs.fields.getByName('session_owner')) {
        zs.fields.removeByName('session_owner')
      }
      const authOk = "@request.auth.id != ''"
      const isAdmin =
        "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
      const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
      const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
      const zaehlCreateUnterlagerOk = `(@request.auth.tenant_id = '' || @request.body.unterlager:isset = false || @request.body.unterlager = '' || unterlager.lager.standort = @request.auth.tenant_id)`
      zs.createRule = `${inventurAll} && ${zaehlCreateUnterlagerOk}`
      zs.updateRule = inventurAll
      app.save(zs)
    } catch {
      /* */
    }
  }
)
