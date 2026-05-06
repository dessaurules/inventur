import PocketBase from 'pocketbase'
import { capabilitiesForRole, normalizeAppRole, recordCanManageUsers } from './userCapabilities'

/**
 * PocketBase-Basis-URL:
 * - Mit VITE_POCKETBASE_URL (z. B. http://127.0.0.1:8090) spricht das Frontend **direkt** mit PB,
 *   aber nur sinnvoll, wenn die Seite selbst unter localhost/127.0.0.1 läuft.
 * - Öffnest du die App per ngrok oder LAN-IP, wäre 127.0.0.1 im Browser **der Rechner des Nutzers** —
 *   dann wird stattdessen `${origin}/api/pb` genutzt (Vite leitet `/api` an Express :3000 weiter).
 * - Dafür muss parallel **`npm run server`** laufen (Proxy zu PocketBase).
 * - Ohne VITE_POCKETBASE_URL: immer gleicher Host + `/api/pb`.
 */
function isLoopbackPocketBaseUrl(url) {
  if (!url || typeof url !== 'string') return false
  const s = url.trim().toLowerCase().replace(/\/+$/, '')
  return (
    s.startsWith('http://127.0.0.1') ||
    s.startsWith('http://localhost') ||
    s.startsWith('https://127.0.0.1') ||
    s.startsWith('https://localhost')
  )
}

function isLocalPageHostname() {
  if (typeof window === 'undefined') return true
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

function resolvePocketBaseBaseUrl() {
  if (typeof window === 'undefined') return ''
  const raw = import.meta.env.VITE_POCKETBASE_URL
  const trimmed = raw != null ? String(raw).trim() : ''
  if (trimmed !== '') {
    const base = trimmed.replace(/\/$/, '')
    if (!isLoopbackPocketBaseUrl(base)) {
      return base
    }
    if (isLocalPageHostname()) {
      return base
    }
    return `${window.location.origin}/api/pb`
  }
  return `${window.location.origin}/api/pb`
}

export const pb = new PocketBase(resolvePocketBaseBaseUrl())

/** Muss zum Thumb-Namen in der PocketBase-FileField-Konfiguration passen (z. B. 50×50 → `50x50`). */
export const PROFILE_IMAGE_THUMB = '50x50'

function profileImageFilename(record) {
  const v = record?.profile_image
  if (!v) return null
  if (typeof v === 'string') return v || null
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
  return null
}

export function mapPbRecordToUser(record) {
  if (!record) return null
  const rawTenant = record.tenant_id
  let tenantId = null
  if (typeof rawTenant === 'string' && rawTenant.trim()) tenantId = rawTenant.trim()
  else if (rawTenant && typeof rawTenant === 'object' && rawTenant.id) tenantId = String(rawTenant.id).trim()
  const roleKey = normalizeAppRole(record)
  const capabilities = {
    ...capabilitiesForRole(roleKey),
    ...(record.permissions &&
    typeof record.permissions === 'object' &&
    record.permissions.manageUsers === true
      ? { manageUsers: true }
      : {}),
  }
  const imgName = profileImageFilename(record)
  let profileImageThumbUrl = null
  let profileImageUrl = null
  if (imgName) {
    profileImageThumbUrl = pb.files.getURL(record, imgName, { thumb: PROFILE_IMAGE_THUMB })
    profileImageUrl = pb.files.getURL(record, imgName)
  }
  return {
    id: record.id,
    email: record.email ?? '',
    emailConfirmed: Boolean(record.confirmed ?? record.verified),
    verified: Boolean(record.verified),
    firstName: String(record.first_name ?? '').trim(),
    lastName: String(record.last_name ?? '').trim(),
    profileImage: imgName,
    profileImageThumbUrl,
    profileImageUrl,
    role: roleKey,
    tenantId,
    permissions: record.permissions ?? null,
    capabilities,
    /** Nur echte Administratoren (Nutzer verwalten) – Magazin siehe `capabilities.magazinWrite` / `userCan`. */
    isAdmin: recordCanManageUsers(record),
    createdAt: record.created ?? record.createdAt,
  }
}

export function userWithToken(record, token) {
  const user = mapPbRecordToUser(record)
  if (!user) return null
  return { ...user, token: token || '' }
}

function stueckProLiefergebindeFromRecord(raw) {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(9999, Math.floor(n))
}

export function mapPbRecordToArticle(record) {
  if (!record) return null
  const priceValue = Number(record.preis ?? 0)
  const rawLager = record.lager
  let lagerId = ''
  if (typeof rawLager === 'string' && rawLager) lagerId = rawLager
  else if (rawLager && typeof rawLager === 'object' && rawLager.id) lagerId = String(rawLager.id)
  const rawUl = record.unterlager
  let unterlagerId = ''
  if (typeof rawUl === 'string' && rawUl) unterlagerId = rawUl
  else if (rawUl && typeof rawUl === 'object' && rawUl.id) unterlagerId = String(rawUl.id)
  return {
    id: record.id,
    artikelnummer: String(record.artikelnummer ?? '').trim(),
    barcode: String(record.barcode ?? '').trim(),
    name: String(record.name ?? '').trim(),
    preis: Number.isFinite(priceValue) ? priceValue : 0,
    einheit: String(record.einheit ?? '').trim(),
    category: String(record.category ?? '').trim(),
    stueckProLiefergebinde: stueckProLiefergebindeFromRecord(record.stueck_pro_liefergebinde),
    lieferantenArtnr: String(record.lieferanten_artnr ?? '').trim(),
    lagerId,
    unterlagerId,
    archived: record.archived === true,
    updatedAt: record.updated ?? record.updatedAt ?? null,
    createdAt: record.created ?? record.createdAt ?? null,
  }
}
