migrate(
  (app) => {
    const standorte = app.findAllRecords('standorte')
    if (standorte.length === 0) return
    const standortId = standorte[0].id

    const users = app.findAllRecords('users')
    for (const u of users) {
      const current = String(u.getString('tenant_id') ?? '').trim()
      if (!current) {
        u.set('tenant_id', standortId)
        app.save(u)
      }
    }
  },
  (_app) => {}
)
