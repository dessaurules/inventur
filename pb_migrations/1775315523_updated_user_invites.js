/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "date261981154",
    "max": "",
    "min": "",
    "name": "expires_at",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // remove field
  collection.fields.removeById("date261981154")

  return app.save(collection)
})
