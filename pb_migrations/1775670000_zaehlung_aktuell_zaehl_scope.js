/// <reference path="../pb_data/types.d.ts" />
/**
 * Pro Lager/Unterlager getrennte Zählpositionen: zaehl_scope z. B. "l:<id>" / "u:<id>" / "" (Legacy).
 * Unique (session, artikel, zaehl_scope). Bestehende Zeilen: zaehl_scope = "".
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('zaehlung_aktuell')
    if (!col.fields.getByName('zaehl_scope')) {
      col.fields.add(
        new Field({
          type: 'text',
          name: 'zaehl_scope',
          required: false,
          min: 0,
          max: 80,
        })
      )
    }
    const stripZaehlIndexes = (indexes) =>
      (indexes || []).filter(
        (line) =>
          !String(line).includes('idx_zaehlung_aktuell_session_artikel') &&
          !String(line).includes('idx_zaehlung_aktuell_scope')
      )
    col.indexes = stripZaehlIndexes(col.indexes)
    app.save(col)

    try {
      const recs = app.findRecordsByFilter('zaehlung_aktuell', '', '', 50000, 0)
      for (const rec of recs) {
        const v = rec.get('zaehl_scope')
        if (v == null || v === undefined) {
          rec.set('zaehl_scope', '')
          app.save(rec)
        }
      }
    } catch {
      /* */
    }

    const col2 = app.findCollectionByNameOrId('zaehlung_aktuell')
    const base = stripZaehlIndexes(col2.indexes)
    if (!base.some((line) => String(line).includes('idx_zaehlung_aktuell_scope'))) {
      col2.indexes = [
        ...base,
        'CREATE UNIQUE INDEX idx_zaehlung_aktuell_scope ON zaehlung_aktuell (session, artikel, zaehl_scope)',
      ]
    } else {
      col2.indexes = base
    }
    app.save(col2)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('zaehlung_aktuell')
      if (col.fields.getByName('zaehl_scope')) {
        col.fields.removeByName('zaehl_scope')
      }
      const filtered = (col.indexes || []).filter(
        (line) => !String(line).includes('idx_zaehlung_aktuell_scope')
      )
      const hasOld = filtered.some((line) =>
        String(line).includes('idx_zaehlung_aktuell_session_artikel')
      )
      col.indexes = hasOld
        ? filtered
        : [
            ...filtered,
            'CREATE UNIQUE INDEX idx_zaehlung_aktuell_session_artikel ON zaehlung_aktuell (session, artikel)',
          ]
      app.save(col)
    } catch {
      /* */
    }
  }
)
