import * as XLSX from 'xlsx'

/** Normalisierte Kopfzeilen → Feldname in PocketBase */
const FIELD_ALIASES = {
  artikelnummer: [
    'artikelnummer',
    'artikel-nr',
    'art-nr',
    'art.-nr.',
    'art.nr.',
    'art nr',
    'artnr',
    'artikelnr',
    'sku',
    'art.code',
    'art code',
    'artikel nr',
  ],
  name: ['name', 'bezeichnung', 'artikelname', 'artikelbezeichnung', 'produktname', 'artikel'],
  preis: [
    'preis',
    'price',
    'einzelpreis',
    'vk',
    'verkaufspreis',
    'ep',
    'einzel',
    'bruttopreis',
    'preis netto',
    'nettopreis',
  ],
  einheit: ['einheit', 'unit', 'eh', 'me', 'mengeneinheit'],
  category: ['kategorie', 'category', 'gruppe', 'warengruppe', 'waren gruppe'],
}

const GERMAN_LABEL = {
  artikelnummer: 'Artikelnummer',
  name: 'Name / Bezeichnung',
  preis: 'Preis',
  einheit: 'Einheit',
  category: 'Kategorie',
}

function normHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

function buildAliasMap() {
  const m = new Map()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      m.set(normHeader(a), field)
    }
  }
  return m
}

const ALIAS_MAP = buildAliasMap()

function headerCellToField(cell) {
  const n = normHeader(cell)
  if (!n) return null
  if (ALIAS_MAP.has(n)) return ALIAS_MAP.get(n)
  const cut = n.split(/[\s(/]/)[0]
  if (cut && ALIAS_MAP.has(cut)) return ALIAS_MAP.get(cut)
  return null
}

function buildColumnMap(headers) {
  const map = {}
  const usedFields = new Set()
  for (let i = 0; i < headers.length; i++) {
    const field = headerCellToField(headers[i])
    if (field && !usedFields.has(field)) {
      map[i] = field
      usedFields.add(field)
    }
  }
  return map
}

function parsePreisCell(val) {
  if (val == null || val === '') return NaN
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const t = String(val)
    .trim()
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(',', '.')
  if (!t) return NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function cellVal(row, idx) {
  if (idx == null || idx < 0) return ''
  const v = row[idx]
  if (v == null) return ''
  return v
}

function rowIsAllEmpty(row) {
  if (!row || !row.length) return true
  return row.every((c) => String(c ?? '').trim() === '')
}

function trimLeadingEmptyRows(data) {
  let i = 0
  while (i < data.length && rowIsAllEmpty(data[i])) i += 1
  return data.slice(i)
}

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true })
}

/** Inventur-Vorlage: Art.Nr. | Warengruppe-Header | Menge | EINHEIT | Preis Netto | … */
function looksLikeInventurTemplate(headers) {
  if (!headers || headers.length < 5) return false
  const h = headers.map((x) => normHeader(x))
  const art = headerCellToField(headers[0])
  if (art !== 'artikelnummer') return false
  return h[2] === 'menge'
}

function isInventurSubHeaderRow(row) {
  if (!row || row.length < 3) return false
  const c0 = row[0]
  if (typeof c0 === 'number') return false
  if (headerCellToField(String(c0 ?? '')) !== 'artikelnummer') return false
  return normHeader(row[2]) === 'menge'
}

function stringArtikelnummer(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw))
  return String(raw).trim()
}

function parseInventurSheetRows(data) {
  let currentCategory = ''
  const rows = []
  for (let r = 0; r < data.length; r += 1) {
    const rawRow = data[r]
    if (rowIsAllEmpty(rawRow)) continue
    const line = r + 1

    if (isInventurSubHeaderRow(rawRow)) {
      const cat = String(cellVal(rawRow, 1) ?? '').trim()
      if (cat) currentCategory = cat
      continue
    }

    const artikelnummer = stringArtikelnummer(cellVal(rawRow, 0))
    const name = String(cellVal(rawRow, 1) ?? '').trim()
    if (!artikelnummer && !name) continue

    // Sammelzeilen überspringen (z. B. "Summe", reine Lieferantenzeilen ohne Preis und ohne Artikelnummer)
    const normName = normHeader(name)
    if (!artikelnummer && (normName === 'summe' || normName === 'gesamt' || normName === 'total')) continue

    const preis = parsePreisCell(cellVal(rawRow, 4))
    const einheit = String(cellVal(rawRow, 3) ?? '').trim() || 'Stk'

    // Zeilen ohne Artikelnummer und ohne gültigen Preis sind wahrscheinlich keine echten Artikel
    if (!artikelnummer && !Number.isFinite(preis)) continue

    rows.push({
      line,
      artikelnummer,
      name,
      preis,
      einheit,
      category: currentCategory,
    })
  }
  return rows
}

/**
 * @param {unknown[][]} data
 * @returns {{ ok: boolean, rows?: object[], mappedLabels?: string[], error?: string }}
 */
function tryParseStandardSheet(data) {
  if (!Array.isArray(data) || data.length < 2) {
    return { ok: false, error: 'Weniger als 2 Zeilen.' }
  }

  const headers = data[0].map((h) => String(h ?? ''))
  const colMap = buildColumnMap(headers)
  const idxByField = {}
  for (const [idx, field] of Object.entries(colMap)) {
    idxByField[field] = Number(idx)
  }

  const required = ['name', 'preis']
  const missing = required.filter((f) => idxByField[f] === undefined)
  if (missing.length) {
    const need = missing.map((f) => GERMAN_LABEL[f] ?? f).join(', ')
    return {
      ok: false,
      error: `Pflicht-Spalten nicht erkannt: ${need}. Kopfzeile braucht Bezeichnung und Preis (Artikelnummer optional).`,
    }
  }

  const mappedFields = ['artikelnummer', 'name', 'preis'].filter((f) => idxByField[f] !== undefined).concat(
    ['einheit', 'category'].filter((f) => idxByField[f] !== undefined)
  )
  const mappedLabels = mappedFields.map((f) => GERMAN_LABEL[f] ?? f)

  const rows = []
  for (let r = 1; r < data.length; r += 1) {
    const line = r + 1
    const rawRow = data[r]
    if (rowIsAllEmpty(rawRow)) continue

    const artikelnummer =
      idxByField.artikelnummer !== undefined
        ? String(cellVal(rawRow, idxByField.artikelnummer) ?? '').trim()
        : ''
    const name = String(cellVal(rawRow, idxByField.name) ?? '').trim()
    if (!artikelnummer && !name) continue

    const preis = parsePreisCell(cellVal(rawRow, idxByField.preis))
    const einheitRaw =
      idxByField.einheit !== undefined ? cellVal(rawRow, idxByField.einheit) : ''
    const categoryRaw =
      idxByField.category !== undefined ? cellVal(rawRow, idxByField.category) : ''

    rows.push({
      line,
      artikelnummer,
      name,
      preis,
      einheit: String(einheitRaw ?? '').trim() || 'Stk',
      category: String(categoryRaw ?? '').trim(),
    })
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        'Keine gültigen Datenzeilen: mindestens Name und gültigen Preis pro Zeile (Artikelnummer optional).',
    }
  }

  return { ok: true, rows, mappedLabels }
}

/**
 * Liest die Workbook; probiert alle Blätter (nach vorne: Inventur-Layout, sonst Standard).
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ ok: boolean, rows?: Array<Record<string, unknown>>, error?: string, mappedLabels?: string[], sourceSheet?: string }}
 */
export function parseArtikelExcelBuffer(arrayBuffer) {
  let wb
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array' })
  } catch {
    return { ok: false, error: 'Die Datei konnte nicht als Excel gelesen werden.' }
  }
  const sheetNames = wb.SheetNames
  if (!sheetNames?.length) {
    return { ok: false, error: 'Die Arbeitsmappe enthält kein Blatt.' }
  }

  const hints = []

  /* Letztes passendes Blatt zuerst: in Inventur-Dateien stehen aktuelle Monate oft am Ende der Liste. */
  for (const sheetName of [...sheetNames].reverse()) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    let data = trimLeadingEmptyRows(sheetToMatrix(sheet))
    if (data.length < 2) {
      hints.push(`„${sheetName}“: weniger als 2 nicht-leere Zeilen.`)
      continue
    }

    const headers = data[0].map((h) => String(h ?? ''))

    if (looksLikeInventurTemplate(headers)) {
      const rows = parseInventurSheetRows(data).filter((row) => {
        const hasNr = Boolean(String(row.artikelnummer ?? '').trim())
        const hasName = Boolean(String(row.name ?? '').trim())
        return hasNr || hasName
      })
      if (rows.length > 0) {
        return {
          ok: true,
          rows,
          mappedLabels: [
            'Artikelnummer (optional)',
            'Bezeichnung',
            'Preis (netto)',
            'Einheit',
            'Kategorie (aus Abschnitt)',
          ],
          sourceSheet: sheetName,
        }
      }
      hints.push(
        `„${sheetName}“: erkannt als Inventur-Tabelle, aber keine Zeilen mit Artikelnummer oder Bezeichnung.`,
      )
      continue
    }

    const standard = tryParseStandardSheet(data)
    if (standard.ok) {
      return { ...standard, sourceSheet: sheetName }
    }
    hints.push(`„${sheetName}“: ${standard.error}`)
  }

  const tail = hints.length > 6 ? `\n… (${hints.length} Blätter geprüft)` : ''
  return {
    ok: false,
    error: `Kein verwendbares Arbeitsblatt gefunden. Tipps: Blatt mit Kopfzeile „Art.Nr.“ / „Menge“ / „Preis Netto“ nutzen, oder eine einfache Tabelle mit Spalten Name und Preis (Artikelnummer optional).\n\n${hints.slice(0, 6).join('\n')}${tail}`,
  }
}
