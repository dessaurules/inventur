/// <reference path="../pb_data/types.d.ts" />
/** preis_vorher optional (echter NULL für „erster Preis“). */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('artikel_preis_historie')
    if (collection.fields.getByName('preis_vorher')) {
      collection.fields.removeByName('preis_vorher')
    }
    collection.fields.add(
      new Field({
        type: 'number',
        name: 'preis_vorher',
        required: false,
        max: 999999,
        noDecimal: false,
      })
    )
    return app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('artikel_preis_historie')
      if (collection.fields.getByName('preis_vorher')) {
        collection.fields.removeByName('preis_vorher')
      }
      collection.fields.add(
        new Field({
          type: 'number',
          name: 'preis_vorher',
          required: true,
          min: 0,
          max: 999999,
          noDecimal: false,
        })
      )
      return app.save(collection)
    } catch {
      /* */
    }
  }
)
