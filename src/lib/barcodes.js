/** Vergleich gescannt vs. gespeichert (Trim, optional nur Ziffern). */
export function barcodesMatch(storedRaw, scannedRaw) {
  const a = String(storedRaw ?? '').trim()
  const b = String(scannedRaw ?? '').trim()
  if (!a || !b) return false
  if (a === b) return true
  const da = a.replace(/\D/g, '')
  const db = b.replace(/\D/g, '')
  if (!da || !db) return false
  return da === db
}

export async function fetchOpenFoodFactsName(barcode) {
  const code = String(barcode ?? '').trim()
  if (!code) return ''
  try {
    const digits = code.replace(/\D/g, '')
    const res = await fetch(`/api/openfoodfacts/product/${encodeURIComponent(digits || code)}`)
    if (!res.ok) return ''
    const data = await res.json()
    const p = data?.product
    return String(p?.product_name_de || p?.product_name || p?.generic_name_de || p?.generic_name || '').trim()
  } catch {
    return ''
  }
}
