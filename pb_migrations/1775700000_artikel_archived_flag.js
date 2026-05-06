/// <reference path="../pb_data/types.d.ts" />
/**
 * Soft-Delete fuer Artikel: archivierte Artikel werden in der UI ausgeblendet.
 */
migrate(
  (app) => {
    const artikel = app.findCollectionByNameOrId('artikel')
    if (!artikel.fields.getByName('archived')) {
      artikel.fields.add(
        new Field({
          type: 'bool',
          name: 'archived',
          required: false,
          presentable: false,
        })
      )
    }
    app.save(artikel)
  },
  (app) => {
    try {
      const artikel = app.findCollectionByNameOrId('artikel')
      if (artikel.fields.getByName('archived')) {
        artikel.fields.removeByName('archived')
        app.save(artikel)
      }
    } catch {
      /* */
    }
  }
)
