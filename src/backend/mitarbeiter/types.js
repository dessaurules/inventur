/**
 * Mappt PocketBase user record zu Employee-Objekt
 * @param {object} record - PocketBase user record
 * @returns {object} Employee object
 */
export function mapPbRecordToEmployee(record) {
  if (!record) return null
  return {
    id: record.id,
    email: record.email ?? '',
    firstName: String(record.first_name ?? '').trim(),
    lastName: String(record.last_name ?? '').trim(),
    fullName: `${String(record.first_name ?? '').trim()} ${String(record.last_name ?? '').trim()}`.trim(),
    role: String(record.role ?? 'inventur').toLowerCase(),
    active: Boolean(record.active ?? true),
    createdAt: record.created ?? null,
    lastActiveAt: record.last_active_at ?? null,
    tenantId: typeof record.tenant_id === 'string'
      ? record.tenant_id
      : (record.tenant_id?.id ?? null),
  }
}

/**
 * Rollen definieren — spiegeln die echten PocketBase-Rollen aus userCapabilities.js
 */
export const ROLES = {
  inventur: { key: 'inventur', label: 'Inventur', order: 0 },
  lagerleiter: { key: 'lagerleiter', label: 'Lagerleiter', order: 1 },
  admin: { key: 'admin', label: 'Admin', order: 2 },
  magazin_readonly: { key: 'magazin_readonly', label: 'Nur Lesen', order: 3 },
}

/**
 * Gruppiere Mitarbeiter nach Rolle mit Counts
 * @param {Array} employees
 * @returns {object} { all, inventur, lagerleiter, admin, magazin_readonly }
 */
export function countsByRole(employees) {
  const counts = {
    all: employees.length,
    inventur: 0,
    lagerleiter: 0,
    admin: 0,
    magazin_readonly: 0,
  }
  for (const emp of employees) {
    if (emp.role in counts) counts[emp.role]++
  }
  return counts
}

/**
 * Filter employees by role
 * @param {Array} employees
 * @param {string} roleFilter - 'all' | 'inventur' | 'lagerleiter' | 'admin' | 'magazin_readonly'
 * @returns {Array} Filtered employees
 */
export function filterByRole(employees, roleFilter) {
  if (roleFilter === 'all') return employees
  return employees.filter((e) => e.role === roleFilter)
}

/**
 * Format lastActiveAt für Display
 * @param {string|null} date - ISO date string
 * @returns {string} Readable format ("vor 2h", "vor 3 Tagen", etc.)
 */
export function formatLastActive(date) {
  if (!date) return 'Nie'
  const then = new Date(date).getTime()
  const now = Date.now()
  const diffMs = now - then
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffH < 1) return 'gerade eben'
  if (diffH < 24) return `vor ${diffH}h`
  if (diffD < 7) return `vor ${diffD}d`
  return new Date(date).toLocaleDateString('de-DE')
}
