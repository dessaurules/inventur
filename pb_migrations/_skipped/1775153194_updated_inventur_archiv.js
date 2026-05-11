/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1042114086")

  // update field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "json1450004590",
    "maxSize": 2097152,
    "name": "positioen",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1042114086")

  // update field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "json1450004590",
    "maxSize": 0,
    "name": "positioen",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
