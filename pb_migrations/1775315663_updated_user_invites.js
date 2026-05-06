/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && (@request.auth.is_admin = true || @request.auth.role = \"admin\")",
    "deleteRule": "@request.auth.id != \"\" && (@request.auth.is_admin = true || @request.auth.role = \"admin\")",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_bLESbd43LY` ON `user_invites` (`token`)"
    ],
    "listRule": "@request.auth.id != \"\" && (@request.auth.is_admin = true || @request.auth.role = \"admin\")",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.is_admin = true || @request.auth.role = \"admin\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.is_admin = true || @request.auth.role = \"admin\")"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "indexes": [],
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
