/**
 * App-Rollen und Berechtigungen (spiegeln die API Rules aus Migration `1775500000_users_roles_tenant_rules`).
 * PocketBase `users`: `role` (Select), optional `permissions` (JSON), `tenant_id` → `standorte`, `is_admin`, `verified`.
 */

export const APP_ROLES = {
  admin: 'admin',
  lagerleiter: 'lagerleiter',
  inventur: 'inventur',
  magazin_readonly: 'magazin_readonly',
}

function truthyBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/** @typedef {'magazin:read' | 'magazin:write' | 'inventur' | 'manageUsers'} AppCapability */

const CAPS_BY_ROLE = {
  [APP_ROLES.admin]: {
    magazinRead: true,
    magazinWrite: true,
    inventur: true,
    manageUsers: true,
  },
  [APP_ROLES.lagerleiter]: {
    magazinRead: true,
    magazinWrite: true,
    inventur: true,
    manageUsers: false,
  },
  [APP_ROLES.inventur]: {
    magazinRead: true,
    magazinWrite: false,
    inventur: true,
    manageUsers: false,
  },
  [APP_ROLES.magazin_readonly]: {
    magazinRead: true,
    magazinWrite: false,
    inventur: false,
    manageUsers: false,
  },
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {string}
 */
export function normalizeAppRole(record) {
  if (!record) return APP_ROLES.lagerleiter
  if (truthyBool(record.is_admin)) return APP_ROLES.admin
  const raw = String(record.app_role ?? record.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!raw) return APP_ROLES.lagerleiter
  if (raw === 'admin' || raw === APP_ROLES.admin) return APP_ROLES.admin
  if (raw === 'lagerleiter' || raw === 'lager_leiter') return APP_ROLES.lagerleiter
  if (raw === 'inventur' || raw === 'zaehler' || raw === 'zähler') return APP_ROLES.inventur
  /** PocketBase-/Legacy-Rolle, in API-Rules wie `inventur` behandelt (s. Migration 1777120000). */
  if (raw === 'users') return APP_ROLES.inventur
  if (
    raw === 'magazin_readonly' ||
    raw === 'magazin-lesen' ||
    raw === 'magazin_lesen' ||
    raw === 'readonly'
  ) {
    return APP_ROLES.magazin_readonly
  }
  return APP_ROLES.inventur
}

/**
 * @param {string} roleKey
 */
export function capabilitiesForRole(roleKey) {
  const caps = CAPS_BY_ROLE[roleKey]
  if (caps) return { ...caps }
  return { ...CAPS_BY_ROLE[APP_ROLES.inventur] }
}

/**
 * @param {{ capabilities?: Record<string, boolean> } | null | undefined} user
 * @param {AppCapability} action
 */
export function userCan(user, action) {
  if (!user?.capabilities) return false
  const c = user.capabilities
  switch (action) {
    case 'magazin:read':
      return Boolean(c.magazinRead)
    case 'magazin:write':
      return Boolean(c.magazinWrite)
    case 'inventur':
      return Boolean(c.inventur)
    case 'manageUsers':
      return Boolean(c.manageUsers)
    default:
      return false
  }
}

/**
 * Server-seitig (z. B. Express): gleiche Rollenlogik ohne React.
 * @param {Record<string, unknown> | null | undefined} record
 */
export function recordCanManageUsers(record) {
  if (!record) return false
  if (truthyBool(record.is_admin)) return true
  if (normalizeAppRole(record) === APP_ROLES.admin) return true
  const p = record.permissions
  if (p && typeof p === 'object' && p.manageUsers === true) return true
  return false
}
