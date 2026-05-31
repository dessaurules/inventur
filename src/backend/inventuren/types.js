/**
 * Mappt PocketBase zaehl_sessions record zu Inventory-Objekt
 * @param {object} record - PocketBase zaehl_sessions record
 * @returns {object} Inventory object
 */
export function mapPbRecordToInventory(record) {
  if (!record) return null
  return {
    id: record.id,
    name: String(record.name ?? '').trim(),
    lager: String(record.lager ?? '').trim(),
    verantwortlicher: record.expand?.session_owner
      ? `${String(record.expand.session_owner.first_name ?? '').trim()} ${String(record.expand.session_owner.last_name ?? '').trim()}`.trim()
      : String(record.verantwortlicher ?? '').trim(),
    status: String(record.status ?? 'vorbereitung').toLowerCase(),
    artikelCount: Number(record.artikel_count ?? 0),
    abweichungen: Number(record.abweichungen ?? 0),
    euroWertSoll: Number(record.euro_wert_soll ?? 0),
    euroWertIst: Number(record.euro_wert_ist ?? 0),
    startDatum: record.start_time ?? null,
    endDatum: record.end_time ?? null,
    notizen: String(record.notizen ?? '').trim(),
    createdAt: record.created ?? null,
    tenantId: typeof record.standort === 'string'
      ? record.standort
      : (record.standort?.id ?? null),
  }
}

/**
 * Lager-Filter Konstanten
 */
export const LAGER_OPTIONS = {
  alle: { key: 'alle', label: 'Alle' },
  küche: { key: 'küche', label: 'Küche' },
  restaurant: { key: 'restaurant', label: 'Restaurant' },
  brauerei: { key: 'brauerei', label: 'Brauerei' },
}

/**
 * Status-Optionen
 */
export const INVENTORY_STATUSES = {
  vorbereitung: { key: 'vorbereitung', label: 'Vorbereitung', color: 'bg-gray-100' },
  aktiv: { key: 'aktiv', label: 'Aktiv', color: 'bg-green-100' },
  abgeschlossen: { key: 'abgeschlossen', label: 'Abgeschlossen', color: 'bg-blue-100' },
}

/**
 * Gruppiere Inventuren nach Lager mit Counts
 * @param {Array} inventuren
 * @returns {object} { alle: count, küche: count, restaurant: count, brauerei: count }
 */
export function countsByLager(inventuren) {
  const counts = {
    alle: inventuren.length,
    küche: 0,
    restaurant: 0,
    brauerei: 0,
  }
  for (const inv of inventuren) {
    const lagerKey = String(inv.lager ?? '').toLowerCase()
    if (lagerKey in counts) counts[lagerKey] = (counts[lagerKey] ?? 0) + 1
  }
  return counts
}

/**
 * Filter inventuren by lager
 * @param {Array} inventuren
 * @param {string} lagerFilter - 'alle' | 'küche' | 'restaurant' | 'brauerei'
 * @returns {Array} Filtered inventuren
 */
export function filterByLager(inventuren, lagerFilter) {
  if (lagerFilter === 'alle') return inventuren
  return inventuren.filter((inv) => String(inv.lager ?? '').toLowerCase() === lagerFilter)
}

/**
 * Format Euro values
 * @param {number} value
 * @returns {string} Formatted string (e.g. "€4.532,50")
 */
export function formatEuro(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

/**
 * Format date to German locale
 * @param {string|null} isoDate
 * @returns {string} Formatted date or '—'
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—'
  try {
    return new Date(isoDate).toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(isoDate)
  }
}
