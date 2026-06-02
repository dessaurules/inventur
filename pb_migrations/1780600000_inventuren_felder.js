/// <reference path="../pb_data/types.d.ts" />
/**
 * Fügt fehlende Felder für die neue Inventuren-Seite hinzu:
 * - zaehl_sessions: name, lager (text), standort, status, notizen, start_time, end_time,
 *                   artikel_count, abweichungen, euro_wert_soll, euro_wert_ist
 * - inventur_archiv: lager (text), session_owner (text), standort, status, artikel_count,
 *                    abweichungen, euro_wert_soll, euro_wert_ist, start_time, end_time, notizen
 */
migrate((app) => {
  const standorte = app.findCollectionByNameOrId('standorte')

  // ── zaehl_sessions ─────────────────────────────────────────────────────────
  const zs = app.findCollectionByNameOrId('zaehl_sessions')

  if (!zs.fields.getByName('name')) {
    zs.fields.add(new Field({ type: 'text', name: 'name', required: false }))
  }
  if (!zs.fields.getByName('lager')) {
    zs.fields.add(new Field({ type: 'text', name: 'lager', required: false }))
  }
  if (!zs.fields.getByName('standort')) {
    zs.fields.add(new Field({ type: 'relation', name: 'standort', required: false, maxSelect: 1, collectionId: standorte.id, cascadeDelete: false }))
  }
  if (!zs.fields.getByName('status')) {
    zs.fields.add(new Field({ type: 'text', name: 'status', required: false }))
  }
  if (!zs.fields.getByName('notizen')) {
    zs.fields.add(new Field({ type: 'text', name: 'notizen', required: false }))
  }
  if (!zs.fields.getByName('start_time')) {
    zs.fields.add(new Field({ type: 'date', name: 'start_time', required: false }))
  }
  if (!zs.fields.getByName('end_time')) {
    zs.fields.add(new Field({ type: 'date', name: 'end_time', required: false }))
  }
  if (!zs.fields.getByName('artikel_count')) {
    zs.fields.add(new Field({ type: 'number', name: 'artikel_count', required: false }))
  }
  if (!zs.fields.getByName('abweichungen')) {
    zs.fields.add(new Field({ type: 'number', name: 'abweichungen', required: false }))
  }
  if (!zs.fields.getByName('euro_wert_soll')) {
    zs.fields.add(new Field({ type: 'number', name: 'euro_wert_soll', required: false }))
  }
  if (!zs.fields.getByName('euro_wert_ist')) {
    zs.fields.add(new Field({ type: 'number', name: 'euro_wert_ist', required: false }))
  }
  app.save(zs)

  // ── inventur_archiv ────────────────────────────────────────────────────────
  const ia = app.findCollectionByNameOrId('inventur_archiv')

  if (!ia.fields.getByName('lager')) {
    ia.fields.add(new Field({ type: 'text', name: 'lager', required: false }))
  }
  if (!ia.fields.getByName('session_owner')) {
    ia.fields.add(new Field({ type: 'text', name: 'session_owner', required: false }))
  }
  if (!ia.fields.getByName('standort')) {
    ia.fields.add(new Field({ type: 'relation', name: 'standort', required: false, maxSelect: 1, collectionId: standorte.id, cascadeDelete: false }))
  }
  if (!ia.fields.getByName('status')) {
    ia.fields.add(new Field({ type: 'text', name: 'status', required: false }))
  }
  if (!ia.fields.getByName('artikel_count')) {
    ia.fields.add(new Field({ type: 'number', name: 'artikel_count', required: false }))
  }
  if (!ia.fields.getByName('abweichungen')) {
    ia.fields.add(new Field({ type: 'number', name: 'abweichungen', required: false }))
  }
  if (!ia.fields.getByName('euro_wert_soll')) {
    ia.fields.add(new Field({ type: 'number', name: 'euro_wert_soll', required: false }))
  }
  if (!ia.fields.getByName('euro_wert_ist')) {
    ia.fields.add(new Field({ type: 'number', name: 'euro_wert_ist', required: false }))
  }
  if (!ia.fields.getByName('start_time')) {
    ia.fields.add(new Field({ type: 'date', name: 'start_time', required: false }))
  }
  if (!ia.fields.getByName('end_time')) {
    ia.fields.add(new Field({ type: 'date', name: 'end_time', required: false }))
  }
  if (!ia.fields.getByName('notizen')) {
    ia.fields.add(new Field({ type: 'text', name: 'notizen', required: false }))
  }
  app.save(ia)
}, (app) => {
  const zsFields = [
    'name','lager','standort','status','notizen','start_time','end_time',
    'artikel_count','abweichungen','euro_wert_soll','euro_wert_ist',
  ]
  const iaFields = [
    'lager','session_owner','standort','status','artikel_count','abweichungen',
    'euro_wert_soll','euro_wert_ist','start_time','end_time','notizen',
  ]

  try {
    const zs = app.findCollectionByNameOrId('zaehl_sessions')
    for (const name of zsFields) { if (zs.fields.getByName(name)) zs.fields.removeByName(name) }
    app.save(zs)
  } catch {}

  try {
    const ia = app.findCollectionByNameOrId('inventur_archiv')
    for (const name of iaFields) { if (ia.fields.getByName(name)) ia.fields.removeByName(name) }
    app.save(ia)
  } catch {}
})
