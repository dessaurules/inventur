/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number3454633574",
    "max": 999999,
    "min": 0,
    "name": "preis",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number3454633574",
    "max": 999999,
    "min": 0,
    "name": "preis",
    "onlyInt": false,
    "presentable": true,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
