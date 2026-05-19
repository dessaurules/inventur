/** @typedef {'name' | 'nr' | 'preis' | 'einheit' | 'updated'} MagazinSortKey */
/** @typedef {'asc' | 'desc'} MagazinSortDir */
/** @typedef {{ key: MagazinSortKey, dir: MagazinSortDir }} MagazinSortState */

/** @param {MagazinSortKey} key */
export function defaultSortDir(key) {
  return key === 'updated' ? 'desc' : 'asc'
}

/**
 * @param {import('./types.js').MagazinArtikel} a
 * @param {import('./types.js').MagazinArtikel} b
 * @param {MagazinSortKey} key
 */
export function compareMagazinArtikel(a, b, key) {
  switch (key) {
    case 'nr':
      return a.nr - b.nr || a.name.localeCompare(b.name, 'de')
    case 'preis':
      return a.preis - b.preis || a.name.localeCompare(b.name, 'de')
    case 'einheit':
      return (
        a.einheit.localeCompare(b.einheit, 'de', { sensitivity: 'base' }) ||
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
      )
    case 'updated':
      return (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0)
    default:
      return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
  }
}

/**
 * @param {import('./types.js').MagazinArtikel[]} list
 * @param {MagazinSortState} sort
 */
export function sortMagazinArticles(list, sort) {
  const out = [...list]
  out.sort((a, b) => {
    const cmp = compareMagazinArtikel(a, b, sort.key)
    return sort.dir === 'asc' ? cmp : -cmp
  })
  return out
}

/**
 * @param {MagazinSortState} prev
 * @param {MagazinSortKey} column
 * @returns {MagazinSortState}
 */
export function toggleColumnSort(prev, column) {
  if (prev.key === column) {
    return { key: column, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key: column, dir: defaultSortDir(column) }
}
