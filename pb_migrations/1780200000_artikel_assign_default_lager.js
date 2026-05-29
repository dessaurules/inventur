migrate(
  (app) => {
    // Für jeden Tenant: erstes Lager ermitteln, alle Artikel ohne Lager zuweisen
    const standorte = app.findAllRecords('standorte')
    for (const standort of standorte) {
      const lagerList = app.findAllRecords('lager', new dbx.Exp(
        'standort = {:standortId} AND aktiv = true',
        { standortId: standort.id }
      ))
      if (!lagerList.length) continue
      const defaultLager = lagerList.sort(
        (a, b) => (a.getInt('sort_index') - b.getInt('sort_index')) || a.id.localeCompare(b.id)
      )[0]

      const artikelOhneLager = app.findAllRecords('artikel', new dbx.Exp(
        'tenant_id = {:tenantId} AND lager = ""',
        { tenantId: standort.id }
      ))
      for (const artikel of artikelOhneLager) {
        artikel.set('lager', defaultLager.id)
        app.save(artikel)
      }
    }
  },
  (app) => {
    // Down: alle Artikel-Lager-Zuordnungen leeren, die durch diese Migration gesetzt wurden
    // (nicht reversibel ohne zusätzliche Tracking-Tabelle — no-op)
  }
)
