/// <reference path="../pb_data/types.d.ts" />
/**
 * Erstellt die user_lager Collection (Nutzer→Lager-Zuweisung).
 * Entspricht user_unterlager, aber referenziert lager statt unterlager.
 */
migrate((app) => {
  const authOk = "@request.auth.id != ''"
  const isAdmin = "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
  const magWrite = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = '')`

  const users = app.findCollectionByNameOrId('users')
  const lager = app.findCollectionByNameOrId('lager')

  let userLager
  try {
    userLager = app.findCollectionByNameOrId('user_lager')
  } catch {
    userLager = new Collection({
      type: 'base',
      name: 'user_lager',
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
          name: 'lager',
          required: true,
          maxSelect: 1,
          collectionId: lager.id,
          cascadeDelete: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_user_lager_pair ON user_lager (nutzer, lager)',
      ],
    })
    app.save(userLager)
    userLager = app.findCollectionByNameOrId('user_lager')
  }

  const tenantLagerMatch = "lager.standort = @request.auth.tenant_id"
  const ulList = `${authOk} && (${isAdmin} || @request.auth.role = 'lagerleiter' || nutzer = @request.auth.id) && ${tenantLagerMatch}`
  const ulWrite = `${authOk} && ${magWrite} && ${tenantLagerMatch} && (nutzer.tenant_id = @request.auth.tenant_id || @request.auth.tenant_id = '')`
  userLager.listRule = ulList
  userLager.viewRule = ulList
  userLager.createRule = ulWrite
  userLager.updateRule = ulWrite
  userLager.deleteRule = ulWrite
  app.save(userLager)
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId('user_lager'))
  } catch {}
})
