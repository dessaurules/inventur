#!/usr/bin/env node
/**
 * Liest pb_data/data.db (SQLite) und zeigt Preis-Historie + Drift gegen artikel.preis.
 * Voraussetzung: sqlite3-CLI im PATH (macOS: oft vorhanden; sonst z. B. brew install sqlite).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dbPath = join(root, 'pb_data', 'data.db')

const SQL = `
.headers on
.mode column
SELECT '=== Anzahl Zeilen ===' AS info;
SELECT COUNT(*) AS artikel_preis_historie_zeilen FROM artikel_preis_historie;

SELECT '=== Letzte 25 Historie-Einträge (neueste zuerst) ===' AS info;
SELECT id, artikel, preis_vorher, preis_nachher, created, geaendert_von
FROM artikel_preis_historie
ORDER BY datetime(replace(replace(created,'T',' '),'Z','')) DESC
LIMIT 25;

SELECT '=== Artikel: aktueller Preis ≠ letzter preis_nachher (|Δ| > 0.001) ===' AS info;
SELECT a.id, a.name, a.preis AS artikel_preis_jetzt,
       h.preis_nachher AS letzter_historie_nachher, h.created AS letzte_historie_zeit
FROM artikel a
JOIN (
  SELECT artikel, preis_nachher, created,
         ROW_NUMBER() OVER (PARTITION BY artikel ORDER BY datetime(replace(replace(created,'T',' '),'Z','')) DESC) AS rn
  FROM artikel_preis_historie
) h ON h.artikel = a.id AND h.rn = 1
WHERE ABS(COALESCE(a.preis,0) - COALESCE(h.preis_nachher,0)) > 0.001
ORDER BY a.name;
`

function main() {
  if (!existsSync(dbPath)) {
    console.error(`Datei fehlt: ${dbPath}`)
    process.exit(1)
  }

  const r = spawnSync('sqlite3', [dbPath], {
    input: SQL,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })

  if (r.error) {
    console.error(
      'sqlite3 nicht ausführbar. Auf macOS: xcode-select --install oder brew install sqlite\n',
      r.error.message
    )
    process.exit(1)
  }

  if (r.status !== 0) {
    console.error(r.stderr || 'sqlite3 beendet mit Fehler')
    process.exit(r.status ?? 1)
  }

  process.stdout.write(r.stdout)
}

main()
