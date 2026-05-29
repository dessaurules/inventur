/// <reference path="../pb_data/types.d.ts" />
/**
 * Migrations-Fix: Alle Artikel (lager = '' oder NULL) dem Lager "Restaurant" (c5e3f226j7agr0t) zuweisen.
 */
migrate((app) => {
  app.db()
    .newQuery(
      `UPDATE artikel SET lager = 'c5e3f226j7agr0t'
       WHERE lager IS NULL OR lager = ''`
    )
    .execute()
})
