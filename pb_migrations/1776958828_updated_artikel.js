/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_artikel_artikelnummer ON artikel (artikelnummer)",
      "CREATE INDEX `idx_snfFpr8uSA` ON `artikel` (`barcode`)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2544763494",
    "max": 0,
    "min": 0,
    "name": "barcode",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_895755225")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_artikel_artikelnummer ON artikel (artikelnummer)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("text2544763494")

  return app.save(collection)
})
