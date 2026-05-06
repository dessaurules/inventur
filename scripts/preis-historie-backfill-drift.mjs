#!/usr/bin/env node
/**
 * Trägt fehlende Preis-Historie für Artikel nach, bei denen artikel.preis vom letzten
 * preis_nachher abweicht (|Δ| > epsilon). Nur SQLite — PocketBase beim Lauf beenden,
 * sonst „database is locked“.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EPS = 0.001

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dbPath = join(root, 'pb_data', 'data.db')

function sqlQuote(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`
}

function pbLikeId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 15; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function main() {
  if (!existsSync(dbPath)) {
    console.error(`Datei fehlt: ${dbPath}`)
    process.exit(1)
  }

  const selectSql = `SELECT a.id AS aid, a.preis AS preis_new, a.tenant_id AS tid, h.preis_nachher AS preis_hist
FROM artikel a
JOIN (
  SELECT artikel, preis_nachher,
         ROW_NUMBER() OVER (PARTITION BY artikel ORDER BY datetime(replace(replace(created,'T',' '),'Z','')) DESC) AS rn
  FROM artikel_preis_historie
) h ON h.artikel = a.id AND h.rn = 1
WHERE ABS(COALESCE(a.preis,0) - COALESCE(h.preis_nachher,0)) > ${EPS}`

  const r = spawnSync('sqlite3', ['-json', dbPath, selectSql], { encoding: 'utf-8' })
  if (r.error) {
    console.error('sqlite3:', r.error.message)
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(r.stderr || 'sqlite3 SELECT fehlgeschlagen')
    process.exit(r.status ?? 1)
  }

  const raw = (r.stdout || '').trim()
  if (!raw) {
    console.log('Keine Drift-Zeilen (nichts nachzutragen).')
    return
  }

  let rows
  try {
    rows = JSON.parse(raw)
  } catch {
    console.error('Unerwartete sqlite-Antwort:', raw.slice(0, 200))
    process.exit(1)
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('Keine Drift-Zeilen.')
    return
  }

  const created = new Date().toISOString().replace('T', ' ')
  let ok = 0
  for (const row of rows) {
    const id = pbLikeId()
    const artikel = row.aid
    const vor = row.preis_hist
    const nach = row.preis_new
    const tid = row.tid ?? ''
    const ins = `INSERT INTO artikel_preis_historie (id, artikel, created, geaendert_von, preis_vorher, preis_nachher, tenant_id) VALUES (${sqlQuote(id)}, ${sqlQuote(artikel)}, ${sqlQuote(created)}, '', ${vor}, ${nach}, ${sqlQuote(tid)});`
    const insR = spawnSync('sqlite3', [dbPath, ins], { encoding: 'utf-8' })
    if (insR.status !== 0) {
      console.error(`Fehler bei Artikel ${artikel}:`, insR.stderr || insR.stdout)
      if (String(insR.stderr || '').includes('locked')) {
        console.error('Hinweis: PocketBase stoppen (`npm run pb` beenden), dann erneut ausführen.')
      }
      process.exit(1)
    }
    ok++
    console.log(`+ ${artikel}: ${vor} → ${nach} (Historie nachgetragen)`)
  }
  console.log(`Fertig: ${ok} Zeile(n) eingefügt.`)
}

main()
