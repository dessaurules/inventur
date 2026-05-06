/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736455494")

  // add field
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3356015194",
    "max": 100,
    "min": 0,
    "name": "last_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "file854170509",
    "maxSelect": 1,
    "maxSize": 5,
    "mimeTypes": [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/tiff",
      "image/bmp",
      "image/heic"
    ],
    "name": "profile_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [
      "50x50"
    ],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736455494")

  // remove field
  collection.fields.removeById("text3356015194")

  // remove field
  collection.fields.removeById("file854170509")

  return app.save(collection)
})
