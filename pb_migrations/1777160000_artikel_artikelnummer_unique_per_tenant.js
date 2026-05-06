/// <reference path="../pb_data/types.d.ts" />
/**
 * Artikelnummer war global unique, Listen/Regeln aber mandantenweise → Create schlug fehl,
 * obwohl die Nummer „für mich“ frei schien. Ab jetzt: eindeutig pro tenant_id.
 *
 * Hinweis: SQLite behandelt NULL in UNIQUE-Sonderfällen; leere/fehlende tenant_id wie bisher.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('artikel')
    const withoutOld = (col.indexes || []).filter(
      (line) => !String(line).includes('idx_artikel_artikelnummer')
    )
    const hasNew = withoutOld.some((line) =>
      String(line).includes('idx_artikel_tenant_artikelnummer')
    )
    col.indexes = hasNew
      ? withoutOld
      : [
          ...withoutOld,
          'CREATE UNIQUE INDEX idx_artikel_tenant_artikelnummer ON artikel (tenant_id, artikelnummer)',
        ]
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('artikel')
    const withoutNew = (col.indexes || []).filter(
      (line) => !String(line).includes('idx_artikel_tenant_artikelnummer')
    )
    const hasOld = withoutNew.some((line) =>
      String(line).includes('idx_artikel_artikelnummer')
    )
    col.indexes = hasOld
      ? withoutNew
      : [
          ...withoutNew,
          'CREATE UNIQUE INDEX idx_artikel_artikelnummer ON artikel (artikelnummer)',
        ]
    app.save(col)
  }
)
