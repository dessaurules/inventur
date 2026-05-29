import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/** Kategorien alphabetisch, Artikel je Kategorie nach Name — wie in der Inventur-Ansicht. */
export function groupTableRowsByCategory(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = String(row?.category ?? '').trim() || 'Ohne Kategorie'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'de', { sensitivity: 'base' }))
    .map(([categoryName, list]) => [
      categoryName,
      [...list].sort((x, y) =>
        String(x?.name ?? '').localeCompare(String(y?.name ?? ''), 'de', { sensitivity: 'base' })
      ),
    ])
}

function rowGesamtEuro(row) {
  const m = Number(row.gezaehlte_menge) || 0
  const p = Number(row.preis) || 0
  return Math.round(m * p * 100) / 100
}

function formatPreisDe(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0,00'
  return v.toFixed(2).replace('.', ',')
}

function formatMengeDe(n) {
  const v = Math.max(0, Number(n) || 0)
  const r = Math.round(v * 100) / 100
  if (r % 1 === 0) return String(r)
  return String(r).replace('.', ',')
}

function formatDeDateHeader(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(iso)
  }
}

export function ortFromPositionRow(row) {
  const ln = String(row.lager_name ?? '').trim()
  const un = String(row.unterlager_name ?? '').trim()
  if (ln && un) return `${ln} → ${un}`
  if (un) return un
  if (ln) return ln
  return ''
}

export function aggregateTableRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key =
      String(row.artikelnummer ?? '').trim() ||
      String(row.artikel_id ?? '') ||
      `${String(row.name ?? '')}|${String(row.einheit ?? '')}`
    if (map.has(key)) {
      const ex = map.get(key)
      ex.gezaehlte_menge = Math.round((ex.gezaehlte_menge + (Number(row.gezaehlte_menge) || 0)) * 100) / 100
    } else {
      map.set(key, {
        ...row,
        unterlager_id: null,
        unterlager_name: '',
        lager_id: null,
        lager_name: '',
      })
    }
  }
  return [...map.values()]
}

function flattenExportRows(tableRows, proUnterlager = false) {
  const rows = proUnterlager ? tableRows : aggregateTableRows(tableRows)
  const flat = []
  for (const [categoryName, list] of groupTableRowsByCategory(rows)) {
    for (const row of list) {
      flat.push({
        category: categoryName,
        ort: ortFromPositionRow(row),
        artikelnummer: String(row.artikelnummer ?? ''),
        name: String(row.name ?? ''),
        einheit: String(row.einheit ?? ''),
        preis: row.preis,
        menge: row.gezaehlte_menge,
        gesamt: rowGesamtEuro(row),
      })
    }
  }
  return flat
}

function csvCell(v) {
  const s = String(v ?? '')
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildExportBasename({ nr, ended }) {
  const datePart =
    ended && !Number.isNaN(new Date(ended).getTime())
      ? new Date(ended).toISOString().slice(0, 10)
      : 'datum'
  return `inventur-${nr}-${datePart}`
}

/**
 * @param {{ nr: number, ended: string | null, started: string | null, tableRows: object[], lagerLabel?: string }} params
 */
export function exportInventurCsv(params) {
  const { nr, ended, started, tableRows, lagerLabel } = params
  const flat = flattenExportRows(tableRows)
  const summe = flat.reduce((a, r) => a + r.gesamt, 0)

  const meta = [
    ['Inventur', `#${nr}`],
    ['Abgeschlossen', formatDeDateHeader(ended)],
    ['Start', formatDeDateHeader(started)],
  ]
  if (lagerLabel) meta.push(['Lager / Ort', lagerLabel])
  meta.push(['', ''])
  const hasOrt = flat.some((r) => r.ort)
  const head = hasOrt
    ? ['Kategorie', 'Ort', 'Art.-Nr.', 'Name', 'Einheit', 'Preis (€)', 'Menge', 'Gesamt (€)']
    : ['Kategorie', 'Art.-Nr.', 'Name', 'Einheit', 'Preis (€)', 'Menge', 'Gesamt (€)']
  const rows = flat.map((r) =>
    hasOrt
      ? [
          r.category,
          r.ort,
          r.artikelnummer,
          r.name,
          r.einheit,
          formatPreisDe(r.preis),
          formatMengeDe(r.menge),
          formatPreisDe(r.gesamt),
        ]
      : [
          r.category,
          r.artikelnummer,
          r.name,
          r.einheit,
          formatPreisDe(r.preis),
          formatMengeDe(r.menge),
          formatPreisDe(r.gesamt),
        ]
  )
  const foot = hasOrt
    ? [['', '', '', '', '', '', 'Summe', formatPreisDe(summe)]]
    : [['', '', '', '', '', 'Summe', formatPreisDe(summe)]]

  const lines = [
    ...meta.map((pair) => pair.map(csvCell).join(';')),
    head.map(csvCell).join(';'),
    ...rows.map((line) => line.map(csvCell).join(';')),
    foot[0].map(csvCell).join(';'),
  ]

  const BOM = '\uFEFF'
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const name = `${buildExportBasename({ nr, ended })}.csv`
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {{ nr: number, ended: string | null, started: string | null, tableRows: object[], lagerLabel?: string, proUnterlager?: boolean }} params
 */
export function exportInventurPdf(params) {
  const { nr, ended, started, tableRows, lagerLabel, proUnterlager = false } = params
  const flat = flattenExportRows(tableRows, proUnterlager)
  const summe = flat.reduce((a, r) => a + r.gesamt, 0)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const marginX = 14
  let y = 12

  doc.setFontSize(14)
  doc.text(`Inventur #${nr}`, marginX, y)
  y += 7
  doc.setFontSize(9)
  doc.setTextColor(55, 65, 81)
  if (ended) {
    doc.text(`Abgeschlossen: ${formatDeDateHeader(ended)}`, marginX, y)
    y += 5
  }
  if (started) {
    doc.text(`Start: ${formatDeDateHeader(started)}`, marginX, y)
    y += 5
  }
  if (lagerLabel) {
    doc.text(`Lager: ${lagerLabel}`, marginX, y)
    y += 5
  }
  doc.setTextColor(0, 0, 0)

  const hasOrt = proUnterlager && flat.some((r) => r.ort)
  const pdfHead = hasOrt
    ? [['Kategorie', 'Ort', 'Art.-Nr.', 'Name', 'Einh.', 'Preis €', 'Menge', 'Gesamt €']]
    : [['Kategorie', 'Art.-Nr.', 'Name', 'Einh.', 'Preis €', 'Menge', 'Gesamt €']]
  const body = hasOrt
    ? flat.map((r) => [
        r.category,
        r.ort || '—',
        r.artikelnummer || '—',
        r.name,
        r.einheit || '—',
        formatPreisDe(r.preis),
        formatMengeDe(r.menge),
        formatPreisDe(r.gesamt),
      ])
    : flat.map((r) => [
        r.category,
        r.artikelnummer || '—',
        r.name,
        r.einheit || '—',
        formatPreisDe(r.preis),
        formatMengeDe(r.menge),
        formatPreisDe(r.gesamt),
      ])
  const emptyRow = hasOrt
    ? ['—', '—', '—', 'Keine Positionen', '—', '—', '—', '—']
    : ['—', '—', 'Keine Positionen', '—', '—', '—', '—']
  const footRow = hasOrt
    ? [`Summe (${flat.length} Positionen)`, '', '', '', '', '', '', formatPreisDe(summe)]
    : [`Summe (${flat.length} Positionen)`, '', '', '', '', '', formatPreisDe(summe)]

  autoTable(doc, {
    startY: y + 2,
    head: pdfHead,
    body: body.length ? body : [emptyRow],
    foot: [footRow],
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
    columnStyles: hasOrt
      ? {
          0: { cellWidth: 22 },
          1: { cellWidth: 24 },
          2: { cellWidth: 18 },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 12 },
          5: { halign: 'right', cellWidth: 16 },
          6: { halign: 'right', cellWidth: 14 },
          7: { halign: 'right', cellWidth: 20 },
        }
      : {
          0: { cellWidth: 28 },
          1: { cellWidth: 22 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 14 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'right', cellWidth: 16 },
          6: { halign: 'right', cellWidth: 22 },
        },
    margin: { left: marginX, right: marginX },
  })

  doc.save(`${buildExportBasename({ nr, ended })}.pdf`)
}
