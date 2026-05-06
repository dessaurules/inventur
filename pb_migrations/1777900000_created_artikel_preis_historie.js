/// <reference path="../pb_data/types.d.ts" />
/**
 * Append-only Preisverlauf pro Artikel. Einträge werden per pb_hooks bei Create/Update von `artikel` geschrieben.
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    const users = app.findCollectionByNameOrId('users')

    const authOk = "@request.auth.id != ''"
    const isAdmin =
      "(@request.auth.role = 'admin' || @request.auth.is_admin = true)"
    const tenantOk =
      "(@request.auth.tenant_id = '' || tenant_id = '' || @request.auth.tenant_id = tenant_id)"
    const magRead = `(${isAdmin} || @request.auth.role = 'lagerleiter' || @request.auth.role = 'inventur' || @request.auth.role = 'magazin_readonly' || @request.auth.role = 'users' || @request.auth.role = '')`
    const listRule = `${authOk} && ${tenantOk} && ${magRead}`

    const collection = new Collection({
      id: 'pbc_918273645',
      name: 'artikel_preis_historie',
      type: 'base',
      system: false,
      listRule,
      viewRule: listRule,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          hidden: false,
          name: 'created',
          onCreate: true,
          onUpdate: false,
          presentable: true,
          system: false,
          type: 'autodate',
        },
        {
          name: 'artikel',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: artikel.id,
          cascadeDelete: true,
        },
        {
          type: 'text',
          name: 'tenant_id',
          required: false,
          min: 0,
          max: 200,
        },
        {
          type: 'number',
          name: 'preis_vorher',
          required: false,
          min: 0,
          max: 999999,
          noDecimal: false,
        },
        {
          type: 'number',
          name: 'preis_nachher',
          required: true,
          min: 0,
          max: 999999,
          noDecimal: false,
        },
        {
          name: 'geaendert_von',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
      ],
      indexes: [
        'CREATE INDEX `idx_preis_hist_artikel_created` ON `artikel_preis_historie` (`artikel`, `created`)',
      ],
    })

    return app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('pbc_918273645')
      return app.delete(collection)
    } catch {
      /* */
    }
  }
)
