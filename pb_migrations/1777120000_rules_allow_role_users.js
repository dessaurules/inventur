/// <reference path="../pb_data/types.d.ts" />
/**
 * Rolle `users` (z. B. ältere/Default-Nutzer oder manuell gesetzt) wie `inventur` behandeln:
 * Lesen Magazin, Zähl-Collections, Artikel anlegen/ändern (Barcode), keine Magazin-Löschrechte.
 *
 * Ohne diese Erweiterung schlagen list/create auf zaehl_sessions fehl → keine offenen Sessions,
 * keine Dashboard-Kennzahlen, „Failed to create record“ beim Start.
 */
migrate(
  (app) => {
    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"
    const magRead = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'magazin_readonly' || @request.auth.role = 'users' || @request.auth.role = '')`
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'users' || @request.auth.role = '')`
    const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
    const artikelList = `${authOk} && ${tenantOk} && ${magRead}`
    const artikelMutate = `${authOk} && ${tenantOk} && (${magWrite} || @request.auth.role = 'inventur' || @request.auth.role = 'users')`
    const tenantStandortMatch = `(@request.auth.tenant_id = '' || standort = @request.auth.tenant_id)`
    const tenantLagerMatch = `(@request.auth.tenant_id = '' || lager.standort = @request.auth.tenant_id)`
    const tenantUnterlagerMatch = `(@request.auth.tenant_id = '' || unterlager.lager.standort = @request.auth.tenant_id)`
    const zaehlCreateUnterlagerOk = `(@request.auth.tenant_id = '' || @request.body.unterlager:isset = false || @request.body.unterlager = '' || unterlager.lager.standort = @request.auth.tenant_id)`
    const ownerOnCreate = `@request.body.session_owner = @request.auth.id`
    const ownerOrAdminUpdate = `(${isAdmin} || session_owner = @request.auth.id)`

    const artikel = app.findCollectionByNameOrId('artikel')
    artikel.listRule = artikelList
    artikel.viewRule = artikelList
    artikel.createRule = artikelMutate
    artikel.updateRule = artikelMutate
    app.save(artikel)

    for (const name of ['zaehlung_aktuell', 'inventur_archiv']) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = inventurAll
      col.viewRule = inventurAll
      col.createRule = inventurAll
      col.updateRule = inventurAll
      col.deleteRule = inventurAll
      app.save(col)
    }

    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    zs.listRule = inventurAll
    zs.viewRule = inventurAll
    zs.createRule = `${inventurAll} && ${zaehlCreateUnterlagerOk} && ${ownerOnCreate}`
    zs.updateRule = `${inventurAll} && ${ownerOrAdminUpdate}`
    zs.deleteRule = inventurAll
    app.save(zs)

    try {
      const lager = app.findCollectionByNameOrId('lager')
      lager.listRule = `${authOk} && ${magRead} && ${tenantStandortMatch}`
      lager.viewRule = lager.listRule
      app.save(lager)
    } catch {
      /* */
    }
    try {
      const unterlager = app.findCollectionByNameOrId('unterlager')
      unterlager.listRule = `${authOk} && ${magRead} && ${tenantLagerMatch}`
      unterlager.viewRule = unterlager.listRule
      app.save(unterlager)
    } catch {
      /* */
    }
  },
  (app) => {
    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"
    const magRead = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'magazin_readonly' || @request.auth.role = '')`
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const invCrud = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = '')`
    const inventurAll = `${authOk} && (@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id) && ${invCrud}`
    const artikelList = `${authOk} && ${tenantOk} && ${magRead}`
    const artikelMutate = `${authOk} && ${tenantOk} && (${magWrite} || @request.auth.role = 'inventur')`
    const tenantStandortMatch = `(@request.auth.tenant_id = '' || standort = @request.auth.tenant_id)`
    const tenantLagerMatch = `(@request.auth.tenant_id = '' || lager.standort = @request.auth.tenant_id)`
    const zaehlCreateUnterlagerOk = `(@request.auth.tenant_id = '' || @request.body.unterlager:isset = false || @request.body.unterlager = '' || unterlager.lager.standort = @request.auth.tenant_id)`
    const ownerOnCreate = `@request.body.session_owner = @request.auth.id`
    const ownerOrAdminUpdate = `(${isAdmin} || session_owner = @request.auth.id)`

    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      artikel.listRule = artikelList
      artikel.viewRule = artikelList
      artikel.createRule = artikelMutate
      artikel.updateRule = artikelMutate
      app.save(artikel)
    } catch {
      /* */
    }
    for (const name of ['zaehlung_aktuell', 'inventur_archiv']) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.listRule = inventurAll
        col.viewRule = inventurAll
        col.createRule = inventurAll
        col.updateRule = inventurAll
        col.deleteRule = inventurAll
        app.save(col)
      } catch {
        /* */
      }
    }
    try {
      const zs = app.findCollectionByNameOrId('zaehl_sessions')
      zs.listRule = inventurAll
      zs.viewRule = inventurAll
      zs.createRule = `${inventurAll} && ${zaehlCreateUnterlagerOk} && ${ownerOnCreate}`
      zs.updateRule = `${inventurAll} && ${ownerOrAdminUpdate}`
      zs.deleteRule = inventurAll
      app.save(zs)
    } catch {
      /* */
    }
    try {
      const lager = app.findCollectionByNameOrId('lager')
      lager.listRule = `${authOk} && ${magRead} && ${tenantStandortMatch}`
      lager.viewRule = lager.listRule
      app.save(lager)
    } catch {
      /* */
    }
    try {
      const unterlager = app.findCollectionByNameOrId('unterlager')
      unterlager.listRule = `${authOk} && ${magRead} && ${tenantLagerMatch}`
      unterlager.viewRule = unterlager.listRule
      app.save(unterlager)
    } catch {
      /* */
    }
  }
)
