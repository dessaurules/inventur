import { barcodesMatch } from './barcodes.js'

/** Scanner-Ende: CR/LF/Tab entfernen, nur Ziffern für Prüfung. */
export function normalizeScannedCode(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[\r\n\t]+$/g, '')
    .trim()
}

/** Vollständiger Barcode (typ. EAN) — kein Enter nötig, Debounce reicht. */
export function looksLikeBarcode(code) {
  const digits = normalizeScannedCode(code).replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 20
}

/**
 * @param {Array<{ id: string, barcode?: string }>} items
 * @param {string} code
 */
export function findArticleByBarcodeCode(items, code) {
  const c = normalizeScannedCode(code)
  if (!c) return null
  return items.find((it) => barcodesMatch(it.barcode, c)) ?? null
}
