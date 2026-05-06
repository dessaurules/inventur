/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3740869139")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.id != \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3740869139")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
