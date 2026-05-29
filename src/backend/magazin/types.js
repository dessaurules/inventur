/**
 * @typedef {Object} MagazinArtikel
 * @property {number} nr
 * @property {string} id
 * @property {string} artikelnummer
 * @property {string} name
 * @property {number} preis
 * @property {string} einheit
 * @property {number} stueckProLiefergebinde — Zähleinheiten pro Liefergebinde (Rechnung), min. 1
 * @property {string} lieferantenArtnr — optionale Art.-Nr. vom Lieferanten (Import)
 * @property {string|null} kategorieId
 * @property {string|null} lagerId
 * @property {Date|null} updatedAt
 * @property {string} updatedBy
 * @property {boolean} archived
 */

/** Für Rechnungs-Import: Einzelpreis = Gebindepreis ÷ diesen Wert (1 = kein Gebinde). */
export function normalizeStueckProLiefergebinde(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(9999, Math.floor(n))
}

/**
 * @typedef {Object} MagazinKategorie
 * @property {string} id
 * @property {string} name
 * @property {number} sort
 */

const CAT_ORDER_KEY = 'vibe-magazin-category-order-v1'

/** @param {string[]} categories */
export function loadCategoryOrder(categories) {
  try {
    const raw = sessionStorage.getItem(CAT_ORDER_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    const set = new Set(categories)
    return arr.filter((x) => typeof x === 'string' && set.has(x))
  } catch {
    return null
  }
}

/** @param {string[]} ordered */
export function saveCategoryOrder(ordered) {
  try {
    sessionStorage.setItem(CAT_ORDER_KEY, JSON.stringify(ordered))
  } catch {
    /* */
  }
}

/**
 * @param {object} item — App-Artikel (mapPbRecordToArticle)
 * @param {string} [updatedBy]
 * @returns {MagazinArtikel}
 */
export function mapItemToMagazinArtikel(item, updatedBy = '') {
  const artNr = String(item.artikelnummer ?? '').trim()
  const digits = artNr.replace(/\D/g, '')
  const nr = digits ? Number(digits) : Number(artNr.replace(',', '.')) || 0
  const cat = String(item.category ?? '').trim()
  return {
    nr,
    id: item.id,
    artikelnummer: artNr,
    name: String(item.name ?? ''),
    preis: typeof item.preis === 'number' && Number.isFinite(item.preis) ? item.preis : 0,
    einheit: String(item.einheit ?? '').trim() || 'Stk',
    stueckProLiefergebinde: normalizeStueckProLiefergebinde(item.stueckProLiefergebinde),
    lieferantenArtnr: String(item.lieferantenArtnr ?? '').trim(),
    kategorieId: cat || null,
    lagerId: String(item.lagerId ?? '').trim() || null,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
    updatedBy,
    archived: item.archived === true,
  }
}

/** @param {MagazinArtikel} a */
export function artikelMatchesSmartNoCat(a) {
  return !a.kategorieId
}
