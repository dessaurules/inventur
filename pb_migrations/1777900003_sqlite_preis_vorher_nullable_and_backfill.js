/// <reference path="../pb_data/types.d.ts" />
/**
 * PocketBase ließ preis_vorher in SQLite weiter NOT NULL; Tabelle neu anlegen mit NULL-fähiger Spalte.
 * Anschließend: je ein Historieneintrag pro Artikel ohne Zeile (aktueller Preis).
 */
migrate(
  (app) => {
    const db = app.db()
    db.newQuery('PRAGMA foreign_keys = OFF').execute()

    db.newQuery(`
      CREATE TABLE "artikel_preis_historie__new" (
        "artikel" TEXT DEFAULT '' NOT NULL,
        "created" TEXT DEFAULT '' NOT NULL,
        "geaendert_von" TEXT DEFAULT '' NOT NULL,
        "id" TEXT PRIMARY KEY NOT NULL,
        "preis_nachher" NUMERIC DEFAULT 0 NOT NULL,
        "preis_vorher" NUMERIC,
        "tenant_id" TEXT DEFAULT '' NOT NULL
      );
    `).execute()

    db.newQuery(`
      INSERT INTO "artikel_preis_historie__new" (
        "artikel", "created", "geaendert_von", "id", "preis_nachher", "preis_vorher", "tenant_id"
      )
      SELECT
        "artikel", "created", "geaendert_von", "id", "preis_nachher",
        CASE WHEN "preis_vorher" = 0 THEN NULL ELSE "preis_vorher" END,
        "tenant_id"
      FROM "artikel_preis_historie";
    `).execute()

    db.newQuery('DROP TABLE "artikel_preis_historie";').execute()
    db.newQuery('ALTER TABLE "artikel_preis_historie__new" RENAME TO "artikel_preis_historie";').execute()

    db.newQuery(`
      CREATE INDEX IF NOT EXISTS "idx_preis_hist_artikel_created"
      ON "artikel_preis_historie" ("artikel", "created");
    `).execute()

    db.newQuery('PRAGMA foreign_keys = ON').execute()

    const createdIso = new Date().toISOString().replace('T', ' ')
    db.newQuery(
      `
      INSERT INTO artikel_preis_historie (id, created, artikel, tenant_id, preis_vorher, preis_nachher, geaendert_von)
      SELECT
        ('r' || lower(hex(randomblob(7)))),
        {:created},
        a.id,
        COALESCE(a.tenant_id, ''),
        NULL,
        a.preis,
        ''
      FROM artikel AS a
      WHERE NOT EXISTS (
        SELECT 1 FROM artikel_preis_historie AS h WHERE h.artikel = a.id
      )
    `
    )
      .bind({ created: createdIso })
      .execute()
  },
  (app) => {
    void app
  }
)
