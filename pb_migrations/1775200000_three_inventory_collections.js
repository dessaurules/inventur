/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    let artikelCol
    try {
      artikelCol = app.findCollectionByNameOrId('artikel')
    } catch {
      throw new Error(
        "[zaehl/inventur] Die Collection 'artikel' muss existieren, bevor diese Migration läuft."
      )
    }

    const openRules = {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }

    let sessions = new Collection({
      type: 'base',
      name: 'zaehl_sessions',
      ...openRules,
      fields: [
        {
          type: 'date',
          name: 'started',
          required: true,
        },
        {
          type: 'date',
          name: 'ended',
          required: false,
        },
      ],
    })
    app.save(sessions)

    sessions = app.findCollectionByNameOrId('zaehl_sessions')

    let aktuell = new Collection({
      type: 'base',
      name: 'zaehlung_aktuell',
      ...openRules,
      fields: [
        {
          name: 'session',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: sessions.id,
          cascadeDelete: true,
        },
        {
          name: 'artikel',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: artikelCol.id,
          cascadeDelete: false,
        },
        {
          type: 'number',
          name: 'menge',
          required: true,
          min: 0,
          noDecimal: false,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_zaehlung_aktuell_session_artikel ON zaehlung_aktuell (session, artikel)',
      ],
    })
    app.save(aktuell)

    let archiv = new Collection({
      type: 'base',
      name: 'inventur_archiv',
      ...openRules,
      fields: [
        {
          type: 'text',
          name: 'inventur_id',
          required: true,
          min: 1,
          max: 64,
        },
        {
          type: 'date',
          name: 'abgeschlossen_am',
          required: true,
        },
        {
          name: 'artikel_ref',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: artikelCol.id,
          cascadeDelete: false,
        },
        {
          type: 'text',
          name: 'artikelnummer',
          required: false,
          max: 200,
        },
        {
          type: 'text',
          name: 'name',
          required: true,
          max: 500,
        },
        {
          type: 'number',
          name: 'preis',
          required: false,
          noDecimal: false,
        },
        {
          type: 'text',
          name: 'einheit',
          required: false,
          max: 100,
        },
        {
          type: 'text',
          name: 'groesse',
          required: false,
          max: 100,
        },
        {
          type: 'text',
          name: 'category',
          required: false,
          max: 200,
        },
        {
          type: 'number',
          name: 'gezaehlte_menge',
          required: true,
          min: 0,
          noDecimal: false,
        },
      ],
      indexes: [
        'CREATE INDEX idx_inventur_archiv_inventur_id ON inventur_archiv (inventur_id)',
      ],
    })
    app.save(archiv)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('inventur_archiv'))
    } catch {
      /* already gone */
    }
    try {
      app.delete(app.findCollectionByNameOrId('zaehlung_aktuell'))
    } catch {
      /* already gone */
    }
    try {
      app.delete(app.findCollectionByNameOrId('zaehl_sessions'))
    } catch {
      /* already gone */
    }
  }
)
