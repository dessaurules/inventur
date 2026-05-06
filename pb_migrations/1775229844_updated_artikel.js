/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // remove field
  collection.fields.removeById("text3983576985")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // add field
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3983576985",
    "max": 100,
    "min": 0,
    "name": "groesse",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
})
