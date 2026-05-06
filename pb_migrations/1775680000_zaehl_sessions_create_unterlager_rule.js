/// <reference path="../pb_data/types.d.ts" />
/**
 * zaehl_sessions.createRule: Bei fehlendem Unterlager darf nicht `unterlager.lager…` ausgewertet werden
 * (sonst schlägt die Regel / DrySubmit fehl). Zuerst @request.data.unterlager prüfen.
 */
migrate(
  (app) => {
    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
    const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
    const zaehlCreateUnterlagerOk = `(@request.auth.tenant_id = '' || @request.body.unterlager:isset = false || @request.body.unterlager = '' || unterlager.lager.standort = @request.auth.tenant_id)`

    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    zs.createRule = `${inventurAll} && ${zaehlCreateUnterlagerOk}`
    app.save(zs)
  },
  (app) => {
    try {
      const authOk = "@request.auth.id != ''"
      const isAdmin =
        "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
      const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
      const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
      const zaehlUnterlagerOk = `(@request.auth.tenant_id = '' || unterlager.id = '' || unterlager.lager.standort = @request.auth.tenant_id)`
      const zs = app.findCollectionByNameOrId('zaehl_sessions')
      zs.createRule = `${inventurAll} && ${zaehlUnterlagerOk}`
      app.save(zs)
    } catch {
      /* */
    }
  }
)
