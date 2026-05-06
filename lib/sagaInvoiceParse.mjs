/**
 * Text aus SAGA-Getränkerechnungen: Positionszeilen mit Art-Nr. und E-Preis/€ (Gebinde).
 * Kein vollständiger PDF-Parser — erwartet bereits extrahierten Klartext (pdf-parse).
 *
 * Das SAGA-PDF liefert nach pdf-parse KEINE Tabs. Jede Zeile hat das Format:
 *   <5-6-stellige Art-Nr.><Bezeichnung>   <Menge><Einheit>   <HL>   <E-Preis>   <Ges.Preis>
 * Art-Nr. und Bezeichnung sind direkt verkettet (kein Leerzeichen dazwischen).
 * Mehrzeilige Bezeichnungen (z. B. Weine) haben die Mengenspalte in der Folgezeile.
 */

/** @param {string} s */
export function parseGermanMoney(s) {
  const t = String(s ?? '')
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .trim()
  if (!t) return NaN
  if (t.includes(',')) {
    return parseFloat(t.replace(/\./g, '').replace(',', '.'))
  }
  return parseFloat(t)
}

/**
 * Unterstützte Einheiten (Gebinde-Arten in SAGA-Rechnungen).
 * Regex-Alternation, wird in ROW_RE eingebettet.
 */
const UNITS = 'KA|FL|PACK|MIE|TRA|ST|PK|KT|FLA|KG|PAL|DOS|CS|CTN|BOT|CAN|BAG|BOX|PCS|PCK|PAK|LG'

/**
 * Erkennt den Beginn einer Produktzeile: 5–6 Ziffern unmittelbar gefolgt von einem Nicht-Digit.
 * Achtung: Art-Nr. und Bezeichnung sind im SAGA-PDF ohne Trennzeichen verkettet.
 */
const PRODUCT_START_RE = /^(\d{5,6})([^\d])/

/**
 * Hauptmuster für eine Produktzeile (ggf. über mehrere zusammengefügte Zeilen):
 *   <Art-Nr><Name><2+Whitespace><Menge><Einheit><WS><HL><WS><E-Preis>
 *
 * Gruppen: 1=Art-Nr, 2=Name (roh), 3=Menge/Geb-Zahl, 4=Einheit, 5=E-Preis
 *
 * Hinweis: `.` matcht kein `\n` — mehrzeilige Bezeichnungen werden über join(' ')
 * zusammengeführt, bevor der Regex angewendet wird.
 */
const ROW_RE = new RegExp(
  `^(\\d{5,6})(.+?)\\s{2,}(\\d+)(${UNITS})\\s+[\\d,\\.]+\\s+([\\d,\\.]+)`
)

/**
 * Leitet Stück/Liefergebinde aus dem Produktnamen oder der Gebinde-Menge ab.
 *
 * Strategie:
 * 1. "NxM"-Muster im Namen (z. B. "6x1,0", "24x0,33", "20x0,5") → N
 * 2. Fallback: Menge aus der Rechnung (z. B. "6 FL" → 6, sinnvoll bei Einzel-Flaschen)
 *
 * @param {string} bezeichnung  — bereinigter Produktname
 * @param {number} mengeGeb     — Menge/Geb aus der Rechnung (Gruppe 3 des ROW_RE)
 * @returns {number}
 */
function extractStueck(bezeichnung, mengeGeb) {
  const m = bezeichnung.match(/\b(\d+)x[\d,\.]/i)
  if (m) return parseInt(m[1], 10)
  return mengeGeb
}

/**
 * @param {string} text — gesamter PDF-Text (Ausgabe von pdf-parse)
 * @returns {{
 *   rows: { lieferantenArtnr: string, bezeichnung: string, ePreisGebinde: number, stueckProLiefergebinde: number }[],
 *   parseErrors: string[],
 *   rawTextSample?: string
 * }}
 */
export function parseSagaInvoicePdfText(text) {
  const rawText = String(text ?? '')
  const lines = rawText.split(/\r?\n/)

  // ── Produktgruppen aufbauen ──────────────────────────────────────────────────
  // Jede Gruppe beginnt mit einer Art-Nr.-Zeile; Folgezeilen (Bezeichnungs-
  // fortsetzung, Mengenspalte, Rabatt-Marker) werden derselben Gruppe zugeordnet.
  /** @type {{ artNr: string, lines: string[] }[]} */
  const groups = []
  /** @type {{ artNr: string, lines: string[] } | null} */
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (PRODUCT_START_RE.test(trimmed)) {
      const artNr = /** @type {RegExpMatchArray} */ (trimmed.match(/^(\d{5,6})/))[1]
      current = { artNr, lines: [line] }
      groups.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }

  // ── Daten extrahieren ────────────────────────────────────────────────────────
  /** @type {Map<string, { lieferantenArtnr: string, bezeichnung: string, ePreisGebinde: number }>} */
  const byArt = new Map()
  /** @type {string[]} */
  const parseErrors = []

  for (const { artNr, lines: grpLines } of groups) {
    // 90xxx = Leergut/Pfand, 79xxx = Miete/Transport — kein Verkaufsartikel
    if (/^90|^79/.test(artNr)) continue

    // Alle Gruppenzeilen mit Leerzeichen verbinden (erhält Einrückungen der
    // Mengenzeile → \s{2,} vor Einheit bleibt erhalten)
    const combined = grpLines.join(' ')
    const m = combined.match(ROW_RE)
    if (!m) continue

    const bezeichnung = m[2].replace(/\s+/g, ' ').trim()
    const ePreis = parseGermanMoney(m[5])
    if (!Number.isFinite(ePreis) || ePreis <= 0) continue

    const stueckProLiefergebinde = extractStueck(bezeichnung, parseInt(m[3], 10))
    byArt.set(artNr, { lieferantenArtnr: artNr, bezeichnung, ePreisGebinde: ePreis, stueckProLiefergebinde })
  }

  if (byArt.size === 0) {
    parseErrors.push(
      'Keine erkannten Positionszeilen (Art-Nr. / E-Preis). Layout evtl. anders als SAGA-Erwartung.'
    )
    return { rows: [], parseErrors, rawTextSample: rawText.slice(0, 3000) }
  }
  return { rows: [...byArt.values()], parseErrors }
}
