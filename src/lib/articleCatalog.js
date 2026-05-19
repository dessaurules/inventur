import { mapPbRecordToArticle, pb } from './pocketbase'
import { PB_COLLECTIONS } from './pocketbaseCollections'

const collection = () => PB_COLLECTIONS.artikel

/** Vollständiger Artikelkatalog (Magazin, Zählen). */
export async function fetchArticleCatalog() {
  const records = await pb.collection(collection()).getFullList({
    sort: 'name',
    requestKey: null,
  })
  const allMapped = records
    .map((record) => mapPbRecordToArticle(record))
    .filter((item) => item && item.name)
  return {
    items: allMapped.filter((item) => !item.archived),
    archivedItems: allMapped.filter((item) => item.archived),
  }
}

/** Leichtgewichtige Kachel „Artikel im Katalog“ ohne Voll-Import. */
export async function fetchArticleCatalogCount() {
  try {
    const res = await pb.collection(collection()).getList(1, 1, {
      filter: 'archived != true',
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems ?? 0
  } catch {
    const res = await pb.collection(collection()).getList(1, 1, {
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems ?? 0
  }
}
