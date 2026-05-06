/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "date2548117314",
    "max": "",
    "min": "",
    "name": "consumed_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "bool509165167",
    "name": "target_is_admin",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2591136987",
    "max": 50,
    "min": 0,
    "name": "target_role",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_216739936")

  // remove field
  collection.fields.removeById("date2548117314")

  // remove field
  collection.fields.removeById("bool509165167")

  // remove field
  collection.fields.removeById("text2591136987")

  return app.save(collection)
})
