/// <reference path="../pb_data/types.d.ts" />
/**
 * Rolle `inventur` darf Artikel anlegen und aktualisieren (Barcode-Dialog / Zählen).
 * `deleteRule` bleibt unverändert (nur Lagerleiter/Admin wie bisher).
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')

    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const artikelMutate = `${authOk} && ${tenantOk} && (${magWrite} || @request.auth.role = 'inventur')`

    artikel.createRule = artikelMutate
    artikel.updateRule = artikelMutate

    app.save(artikel)
  },
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')

    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"
    const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`
    const artikelWrite = `${authOk} && ${tenantOk} && ${magWrite}`

    artikel.createRule = artikelWrite
    artikel.updateRule = artikelWrite

    app.save(artikel)
  }
)
