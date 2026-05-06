/** Stabile Zeilen-ID wie in ArticleView (Index aus der vollen `items`-Liste). */
export function rowKeyForItem(item, index) {
  return item.id || [item.artikelnummer, item.name].filter(Boolean).join('|') || `${item.name}-${index}`
}
