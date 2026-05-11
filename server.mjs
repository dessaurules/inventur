import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import http from 'http'
import https from 'https'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import proxy from 'express-http-proxy'
import { runTenantBootstrap } from './lib/tenantBootstrap.mjs'
import { parseSagaInvoicePdfText } from './lib/sagaInvoiceParse.mjs'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = process.env.PORT || 3000

/**
 * Optionales TLS für lokales WLAN (Smartphone-Kamera / Barcode): Browser erlauben getUserMedia nur in
 * „secure contexts“ (https oder localhost). Ohne Zertifikat: nur http – Kamera per LAN-IP gesperrt.
 * Lege certs/key.pem + certs/cert.pem an oder setze HTTPS_KEY + HTTPS_CERT.
 */
function resolveTlsOptions() {
  const keyPath = String(process.env.HTTPS_KEY || path.join(__dirname, 'certs', 'key.pem')).trim()
  const certPath = String(process.env.HTTPS_CERT || path.join(__dirname, 'certs', 'cert.pem')).trim()
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return null
  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  } catch {
    return null
  }
}

/** Ohne trailing slash – sonst entstehen URLs wie `...8090//api/...`. */
const POCKETBASE_URL = (process.env.POCKETBASE_URL || '').trim().replace(/\/+$/, '')
const POCKETBASE_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || ''
const POCKETBASE_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || ''
const PB_USERS_COLLECTION = process.env.POCKETBASE_USERS_COLLECTION || 'users'
const PB_INVITES_COLLECTION = process.env.POCKETBASE_INVITES_COLLECTION || 'user_invites'

const ALLOWED_USER_ROLES = new Set([
  'admin',
  'lagerleiter',
  'inventur',
  'magazin_readonly',
  'users', // Legacy; s. Migration 1777130000 (Select-Werte in PB)
])

let pocketbaseAdminToken = null

function randomInviteTokenHex() {
  return crypto.randomBytes(32).toString('hex')
}

async function getPocketBaseAdminToken() {
  if (!POCKETBASE_URL || !POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) return null
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: POCKETBASE_ADMIN_EMAIL,
        password: POCKETBASE_ADMIN_PASSWORD,
      }),
    })
    if (!res.ok) {
      const hint =
        res.status === 400 || res.status === 401
          ? ' (E-Mail/Passwort für _superusers prüfen — Dashboard „Forgot password“/neuer Superuser, nicht App-Login users.)'
          : ` (HTTP ${res.status}.)`
      console.warn('[PocketBase] Superuser auth-with-password fehlgeschlagen.' + hint)
      return null
    }
    const data = await res.json()
    return data.token || null
  } catch (e) {
    console.error('PocketBase Admin-Login fehlgeschlagen:', e.message)
    return null
  }
}

/** Superuser-Token für Record-Zugriff (vermeidet Race beim Server-Start). */
async function ensurePocketbaseAdminToken() {
  if (pocketbaseAdminToken) return pocketbaseAdminToken
  const t = await getPocketBaseAdminToken()
  pocketbaseAdminToken = t
  return t
}

/** Nach validem auth-refresh: Nutzer-ID aus JWT, falls das Record sie nicht trägt (PB-Versionen / Regeln). */
function pocketBaseJwtPayloadId(token) {
  const raw = String(token || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const a = raw.indexOf('.')
  const b = raw.indexOf('.', a + 1)
  if (a < 0 || b < 0) return null
  let b64 = raw.slice(a + 1, b).replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  b64 += '='.repeat(pad)
  try {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    return typeof json.id === 'string' && json.id ? json.id : null
  } catch {
    return null
  }
}

async function getPocketBaseUserFromToken(token) {
  if (!POCKETBASE_URL || !token) return null
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/auth-refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    let record = data.record && typeof data.record === 'object' ? data.record : null
    const jid = pocketBaseJwtPayloadId(token)
    if (record && !record.id && jid) {
      record = { ...record, id: jid }
    } else if (!record && jid) {
      record = { id: jid }
    }
    return record
  } catch {
    return null
  }
}

function userBearerHeader(token) {
  const t = String(token || '').trim()
  if (!t) return ''
  return t.startsWith('Bearer ') ? t : `Bearer ${t}`
}

/**
 * auth-refresh liefert oft ein gekürztes Record ohne `role` / `is_admin`.
 * 1) Superuser-GET (volle Felder)
 * 2) Fallback: GET mit Nutzer-Token — viewRule erlaubt @request.auth.id = id (Migration users.viewRule).
 */
async function resolveActorForUserManagement(token) {
  const record = await getPocketBaseUserFromToken(token)
  if (!record?.id) return record

  const userAuth = userBearerHeader(token)
  const recordUrl = `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${record.id}`

  const adminTok = await ensurePocketbaseAdminToken()
  if (!adminTok) {
    console.warn(
      '[user-mgmt] Kein Superuser-Token (POCKETBASE_ADMIN_EMAIL/PASSWORD / POCKETBASE_URL) – versuche Profil mit Nutzer-Token.'
    )
  } else {
    try {
      const res = await fetch(recordUrl, { headers: { Authorization: `Bearer ${adminTok}` } })
      if (res.ok) {
        const full = await res.json()
        if (full && typeof full === 'object') return full
      } else {
        console.warn(
          '[user-mgmt] Superuser GET users/',
          record.id,
          '→ HTTP',
          res.status,
          '(Collection-Name POCKETBASE_USERS_COLLECTION korrekt?)'
        )
      }
    } catch (e) {
      console.warn('[user-mgmt] Superuser GET actor:', e.message)
    }
  }

  if (userAuth) {
    try {
      const res = await fetch(recordUrl, { headers: { Authorization: userAuth } })
      if (res.ok) {
        const self = await res.json()
        if (self && typeof self === 'object') {
          return { ...record, ...self }
        }
      }
    } catch (e) {
      console.warn('[user-mgmt] Nutzer-Token GET actor:', e.message)
    }
  }

  return record
}

function truthyBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function normalizeAppRole(record) {
  if (!record) return 'lagerleiter'
  if (truthyBool(record.is_admin)) return 'admin'
  const raw = String(record.app_role ?? record.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!raw) return 'lagerleiter'
  if (raw === 'admin') return 'admin'
  if (raw === 'users') return 'users'
  if (raw === 'lagerleiter' || raw === 'lager_leiter') return 'lagerleiter'
  if (raw === 'inventur' || raw === 'zaehler' || raw === 'zähler') return 'inventur'
  if (
    raw === 'magazin_readonly' ||
    raw === 'magazin-lesen' ||
    raw === 'magazin_lesen' ||
    raw === 'readonly'
  ) {
    return 'magazin_readonly'
  }
  return 'inventur'
}

function parseJsonField(val) {
  if (val && typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return null
    }
  }
  return val
}

function recordCanManageUsers(record) {
  if (!record) return false
  if (truthyBool(record.is_admin)) return true
  const roleNorm = normalizeAppRole(record)
  if (roleNorm === 'admin') return true
  const p = parseJsonField(record.permissions)
  if (p && typeof p === 'object' && p.manageUsers === true) return true
  return false
}

/** Namensfelder aus PB-Record (REST kann snake_case liefern; selten camelCase / einzelnes name). */
function pbUserNameFields(record) {
  if (!record || typeof record !== 'object') {
    return { firstName: '', lastName: '', displayName: '' }
  }
  const pick = (...keys) => {
    for (const k of keys) {
      const v = record[k]
      if (v != null && String(v).trim()) return String(v).trim()
    }
    return ''
  }
  const firstName = pick('first_name', 'firstName')
  const lastName = pick('last_name', 'lastName')
  const fromParts = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (fromParts) {
    return { firstName, lastName, displayName: fromParts }
  }
  const single = pick('name', 'display_name', 'full_name', 'fullName', 'displayName')
  if (single) {
    return { firstName: '', lastName: '', displayName: single }
  }
  const username = pick('username')
  const em = String(record.email ?? '')
    .trim()
    .toLowerCase()
  if (username && username.toLowerCase() !== em) {
    return { firstName: '', lastName: '', displayName: username }
  }
  return { firstName: '', lastName: '', displayName: '' }
}

function mapPbUser(record) {
  if (!record) return null
  const { firstName, lastName, displayName } = pbUserNameFields(record)
  const rawRole = String(record.role ?? '').trim()
  /** Anzeige/PATCH wie in PocketBase gespeichert (Select muss alle Werte kennen, s. Migration 1777130000). */
  const role = rawRole !== '' ? rawRole : normalizeAppRole(record)
  return {
    id: record.id,
    email: record.email || '',
    firstName,
    lastName,
    displayName,
    emailConfirmed: Boolean(record.confirmed ?? record.verified),
    role,
    isAdmin: recordCanManageUsers(record),
    lastActiveAt:
      record.last_active_at != null && record.last_active_at !== '' ? String(record.last_active_at) : null,
    createdAt: record.created || record.createdAt,
  }
}

/** true, wenn die Listenantwort keine Namensfelder als Keys hat (weggelassen vs. leer gesetzt). */
function listPayloadOmitsNameFields(r) {
  if (!r || typeof r !== 'object') return false
  const keys = ['first_name', 'firstName', 'last_name', 'lastName', 'name', 'display_name', 'username']
  return !keys.some((k) => Object.prototype.hasOwnProperty.call(r, k))
}

/** Einzelabruf (Superuser): falls die Listen-API Namensfelder weglässt, Daten nachladen. */
async function fetchPbUserRecordById(id) {
  if (!id || !POCKETBASE_URL) return null
  const tok = await ensurePocketbaseAdminToken()
  if (!tok) return null
  try {
    const res = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${tok}` } }
    )
    if (!res.ok) return null
    const body = await res.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

async function requirePocketBase() {
  if (!POCKETBASE_URL) {
    return { ok: false, status: 503, error: 'PocketBase ist nicht konfiguriert (POCKETBASE_URL).' }
  }
  const tok = await ensurePocketbaseAdminToken()
  if (!tok) {
    return {
      ok: false,
      status: 503,
      error:
        'PocketBase-Superuser nicht verbunden. Für /api/users braucht server.mjs gültige Zugangsdaten der PocketBase-Administration (_superusers): in .env POCKETBASE_ADMIN_EMAIL und POCKETBASE_ADMIN_PASSWORD setzen (Konto aus http://127.0.0.1:8090/_/ — nicht der normale App-Login der Collection „users“). npm run server neu starten.',
    }
  }
  return { ok: true }
}

app.use(cors())

/**
 * PDF-Rechnung: Route vor express.json(), damit der Roh-Body sicher von express.raw gelesen wird.
 * GET: Prüfung, ob dieser Server-Build den Rechnungs-Import hat (alter node-Prozess liefert 404).
 */
app.get('/api/magazin/invoice-import-ping', (_req, res) => {
  res.json({ ok: true, feature: 'parse-invoice-pdf' })
})

/** Einheitliche Health: markiert Express (nicht PocketBase /api/health). */
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({
    status: 'ok',
    expressApi: true,
    magazinParseInvoicePdf: true,
  })
})

/**
 * Body: rohes PDF. type: immer parsen (auch abweichende Content-Types vom Browser).
 * Kein Auth — nur lokal sinnvoll; bei Bedarf später absichern.
 */
app.post(
  '/api/magazin/parse-invoice-pdf',
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    const buf = req.body
    if (!Buffer.isBuffer(buf) || buf.length < 64) {
      return res.status(400).json({ error: 'Kein PDF (Body leer oder zu kurz).' })
    }
    try {
      const data = await pdfParse(buf)
      const text = String(data.text || '')
      const { rows, parseErrors, rawTextSample } = parseSagaInvoicePdfText(text)
      if (rows.length === 0) {
        console.warn('[parse-invoice-pdf] Keine Zeilen erkannt. Erster Rohtext:\n' + (rawTextSample ?? text.slice(0, 3000)))
      }
      return res.json({ ok: true, rows, parseErrors, rawTextSample: rows.length === 0 ? rawTextSample : undefined })
    } catch (e) {
      console.error('parse-invoice-pdf:', e?.message || e)
      return res.status(400).json({ error: e?.message || 'PDF konnte nicht gelesen werden.' })
    }
  }
)

// JSON-Parser nicht für /api/pb: sonst wird der Body vor dem Proxy verbraucht — Login (POST JSON) und
// andere PocketBase-Calls kämen mit leerem Body an PB an (parseReqBody: false nutzt req.pipe).
app.use((req, res, next) => {
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0]
  if (pathOnly.startsWith('/api/pb')) {
    return next()
  }
  return express.json()(req, res, next)
})

/** Open Food Facts: Browser-CORS vermeiden + sinnvoller User-Agent (weniger 429). Kurz-Cache pro Barcode. */
const OPENFOODFACTS_UA =
  String(process.env.OPENFOODFACTS_USER_AGENT || '').trim() ||
  'vibe-inventur/1.0 (dev; contact: set OPENFOODFACTS_USER_AGENT in .env)'
const openFoodFactsCache = new Map()
const OPENFOODFACTS_CACHE_MS = 60_000

app.get('/api/openfoodfacts/product/:code', async (req, res) => {
  const raw = String(req.params.code ?? '').trim()
  const code = raw.replace(/\D/g, '')
  if (code.length < 8 || code.length > 14) {
    return res.status(400).json({ error: 'Ungültiger Barcode (nur Ziffern, typisch 8–13).' })
  }
  const now = Date.now()
  const cached = openFoodFactsCache.get(code)
  if (cached && now - cached.at < OPENFOODFACTS_CACHE_MS) {
    res.status(cached.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return res.send(cached.body)
  }
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': OPENFOODFACTS_UA,
        Accept: 'application/json',
      },
    })
    const body = await r.text()
    openFoodFactsCache.set(code, { at: now, status: r.status, body })
    if (openFoodFactsCache.size > 400) {
      const first = openFoodFactsCache.keys().next().value
      openFoodFactsCache.delete(first)
    }
    res.status(r.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return res.send(body)
  } catch {
    return res.status(502).json({ error: 'Open Food Facts nicht erreichbar.' })
  }
})

/**
 * Einladung annehmen: gültiger Token in user_invites → Nutzer per Admin-API anlegen.
 * Benötigt POCKETBASE_URL + Superuser-Zugang (wie /api/users).
 */
app.post('/api/invite/accept', async (req, res) => {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = String(req.body?.token ?? '').trim()
  const password = String(req.body?.password ?? '')
  const passwordConfirm = String(req.body?.passwordConfirm ?? '')
  if (!token || token.length < 16) {
    return res.status(400).json({ error: 'Ungültiger Einladungslink.' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' })
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ error: 'Passwörter stimmen nicht überein.' })
  }

  const esc = token.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const filter = encodeURIComponent(`token="${esc}"`)

  let invite
  try {
    const listRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_INVITES_COLLECTION}/records?perPage=1&filter=${filter}`,
      { headers: { Authorization: `Bearer ${pocketbaseAdminToken}` } }
    )
    if (!listRes.ok) {
      return res.status(502).json({ error: 'Einladung konnte nicht geprüft werden.' })
    }
    const data = await listRes.json()
    const items = data.items || []
    invite = items[0]
  } catch {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }

  if (!invite) {
    return res.status(404).json({ error: 'Einladung unbekannt oder ungültig.' })
  }
  if (invite.consumed_at) {
    return res.status(409).json({ error: 'Diese Einladung wurde bereits verwendet.' })
  }
  const exp = invite.expires_at ? new Date(invite.expires_at) : null
  if (exp && Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
    return res.status(410).json({ error: 'Diese Einladung ist abgelaufen.' })
  }

  const email = String(invite.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(500).json({ error: 'Einladung ohne E-Mail.' })
  }

  const emailFilter = encodeURIComponent(`email="${email.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  try {
    const existRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records?perPage=1&filter=${emailFilter}`,
      { headers: { Authorization: `Bearer ${pocketbaseAdminToken}` } }
    )
    if (existRes.ok) {
      const existData = await existRes.json()
      if ((existData.items || []).length > 0) {
        return res.status(409).json({ error: 'Ein Nutzer mit dieser E-Mail existiert bereits.' })
      }
    }
  } catch {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }

  const targetRoleRaw = String(invite.target_role ?? '').trim().toLowerCase()
  const allowedRoles = new Set(['admin', 'lagerleiter', 'inventur', 'magazin_readonly'])
  const targetIsAdmin = Boolean(invite.target_is_admin) || targetRoleRaw === 'admin'
  const role =
    targetIsAdmin ? 'admin' : allowedRoles.has(targetRoleRaw) && targetRoleRaw !== 'admin'
      ? targetRoleRaw
      : 'inventur'

  const createBody = {
    email,
    password,
    passwordConfirm,
    emailVisibility: false,
    verified: false,
    role,
    is_admin: targetIsAdmin,
  }

  try {
    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pocketbaseAdminToken}`,
      },
      body: JSON.stringify(createBody),
    })
    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}))
      const msg =
        errBody?.data?.email?.message ||
        errBody?.message ||
        'Nutzer konnte nicht angelegt werden.'
      return res.status(createRes.status).json({ error: String(msg) })
    }
  } catch {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }

  try {
    const consumed = new Date().toISOString()
    const patchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_INVITES_COLLECTION}/records/${invite.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pocketbaseAdminToken}`,
        },
        body: JSON.stringify({ consumed_at: consumed }),
      }
    )
    if (!patchRes.ok) {
      console.warn('invite accept: Nutzer angelegt, aber consumed_at konnte nicht gesetzt werden.')
    }
  } catch {
    console.warn('invite accept: Patch consumed_at fehlgeschlagen.')
  }

  return res.status(201).json({ ok: true, email })
})

/**
 * Einladung anlegen; E-Mail sendet PocketBase Hook pb_hooks/invites.pb.js bei Record-Create auf user_invites.
 * Auth: PocketBase-Nutzer mit Admin-Rechten (manageUsers).
 */
app.post('/api/invite/send', async (req, res) => {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const actor = await resolveActorForUserManagement(authHeader)
  if (!actor) {
    return res.status(401).json({ error: 'Nicht angemeldet.' })
  }
  if (!recordCanManageUsers(actor)) {
    return res.status(403).json({ error: 'Nur Administratoren können Einladungen versenden.' })
  }

  const email = String(req.body?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(400).json({ error: 'E-Mail fehlt.' })
  }

  const validDays = Math.min(90, Math.max(1, Number(req.body?.validDays) || 7))
  let targetRole = String(req.body?.targetRole ?? 'inventur').trim().toLowerCase()
  if (!ALLOWED_USER_ROLES.has(targetRole)) targetRole = 'inventur'
  const targetIsAdmin = targetRole === 'admin'

  let appBaseUrl = String(req.body?.appBaseUrl ?? process.env.APP_PUBLIC_URL ?? '').trim()
  if (!appBaseUrl) appBaseUrl = 'http://localhost:5173'

  const emailEsc = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const emailFilter = encodeURIComponent(`email="${emailEsc}"`)
  try {
    const existRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records?perPage=1&filter=${emailFilter}`,
      { headers: { Authorization: `Bearer ${pocketbaseAdminToken}` } }
    )
    if (existRes.ok) {
      const existData = await existRes.json()
      if ((existData.items || []).length > 0) {
        return res.status(409).json({ error: 'Ein Nutzer mit dieser E-Mail existiert bereits.' })
      }
    }
  } catch {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }

  const token = randomInviteTokenHex()
  const expires = new Date(Date.now() + validDays * 86400000).toISOString()

  let inviteId
  try {
    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/${PB_INVITES_COLLECTION}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pocketbaseAdminToken}`,
      },
      body: JSON.stringify({
        email,
        token,
        expires_at: expires,
        target_is_admin: targetIsAdmin,
        target_role: targetIsAdmin ? 'admin' : targetRole,
      }),
    })
    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}))
      return res.status(createRes.status).json({
        error: errBody.message || 'Einladung konnte nicht in PocketBase angelegt werden.',
      })
    }
    const inv = await createRes.json()
    inviteId = inv.id
  } catch {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }

  return res.status(201).json({
    ok: true,
    email,
    expires_at: expires,
    mailSent: true,
  })
})

// PocketBase-Proxy (Frontend spricht mit PocketBase unter /api/pb)
if (POCKETBASE_URL) {
  app.use(
    '/api/pb',
    proxy(POCKETBASE_URL, {
      // Roh-Body streamen (Multipart/File-Upload). Sonst puffert express-http-proxy den Body —
      // das kann binäre Uploads zu PocketBase stören.
      parseReqBody: false,
      proxyReqPathResolver: (req) => (req.url.startsWith('/') ? req.url : '/' + req.url),
    })
  )
}

app.get('/api/users', async (req, res) => {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' })
  }
  if (!recordCanManageUsers(user)) {
    return res.status(403).json({ error: 'Nur Administratoren haben Zugriff.' })
  }
  try {
    const listRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records?perPage=500`,
      { headers: { Authorization: `Bearer ${pocketbaseAdminToken}` } }
    )
    if (!listRes.ok) {
      return res.status(502).json({ error: 'Nutzerliste konnte nicht geladen werden.' })
    }
    const data = await listRes.json()
    let items = data.items || data || []
    items = await Promise.all(
      items.map(async (r) => {
        if (!r || typeof r !== 'object' || !r.id) return r
        if (pbUserNameFields(r).displayName) return r
        if (!listPayloadOmitsNameFields(r)) return r
        const full = await fetchPbUserRecordById(r.id)
        return full ? { ...r, ...full } : r
      })
    )
    res.json(items.map((r) => mapPbUser(r)))
  } catch (e) {
    res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }
})

async function handleConfirmUser(req, res) {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' })
  }
  if (!recordCanManageUsers(user)) {
    return res.status(403).json({ error: 'Nur Administratoren haben Zugriff.' })
  }
  const id = (req.params.id || '').trim()
  if (!id) {
    return res.status(400).json({ error: 'Ungültige Nutzer-ID.' })
  }
  try {
    const patchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pocketbaseAdminToken}`,
        },
        body: JSON.stringify({ confirmed: true, verified: true }),
      }
    )
    if (!patchRes.ok) {
      const errBody = await patchRes.json().catch(() => ({}))
      return res.status(patchRes.status).json({ error: errBody.message || 'Bestätigung fehlgeschlagen.' })
    }
    const updated = await patchRes.json()
    res.json(mapPbUser(updated))
  } catch (e) {
    res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }
}

app.post('/api/users/:id/confirm', handleConfirmUser)
app.patch('/api/users/:id/confirm', handleConfirmUser)

async function handleUnconfirmUser(req, res) {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' })
  }
  if (!recordCanManageUsers(user)) {
    return res.status(403).json({ error: 'Nur Administratoren haben Zugriff.' })
  }
  const id = (req.params.id || '').trim()
  if (!id) {
    return res.status(400).json({ error: 'Ungültige Nutzer-ID.' })
  }
  try {
    const patchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pocketbaseAdminToken}`,
        },
        body: JSON.stringify({ confirmed: false, verified: false }),
      }
    )
    if (!patchRes.ok) {
      const errBody = await patchRes.json().catch(() => ({}))
      return res.status(patchRes.status).json({ error: errBody.message || 'Zurücksetzen fehlgeschlagen.' })
    }
    const updated = await patchRes.json()
    res.json(mapPbUser(updated))
  } catch (e) {
    res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }
}

app.post('/api/users/:id/unconfirm', handleUnconfirmUser)

app.patch('/api/users/:id', async (req, res) => {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user || !recordCanManageUsers(user)) {
    return res.status(user ? 403 : 401).json({
      error: user ? 'Nur Administratoren haben Zugriff.' : 'Nicht angemeldet.',
    })
  }
  const id = (req.params.id || '').trim()
  const { email, role } = req.body || {}
  if (!id) return res.status(400).json({ error: 'Ungültige Nutzer-ID.' })

  const patch = {}
  if (email !== undefined) {
    const newEmail = String(email).toLowerCase().trim()
    if (!newEmail) return res.status(400).json({ error: 'E-Mail darf nicht leer sein.' })
    patch.email = newEmail
  }
    if (role !== undefined) {
      const r = String(role).trim().toLowerCase()
      if (!ALLOWED_USER_ROLES.has(r)) {
        return res.status(400).json({ error: 'Ungültige Rolle.' })
      }
      if (user.id === id && r !== 'admin' && recordCanManageUsers(user)) {
        return res.status(400).json({ error: 'Die eigene Admin-Rolle kann hier nicht entfernt werden.' })
      }
      patch.role = r
      patch.is_admin = r === 'admin'
    }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Keine Änderung angegeben (email oder role).' })
  }

  try {
    const patchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pocketbaseAdminToken}`,
        },
        body: JSON.stringify(patch),
      }
    )
    if (!patchRes.ok) {
      const errBody = await patchRes.json().catch(() => ({}))
      let detail = typeof errBody.message === 'string' ? errBody.message : ''
      const data = errBody.data
      if (!detail && data && typeof data === 'object') {
        const parts = []
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && typeof v.message === 'string') {
            parts.push(`${k}: ${v.message}`)
          }
        }
        if (parts.length) detail = parts.join(' ')
      }
      if (/failed to update record/i.test(detail) && patch.role != null) {
        detail +=
          (detail.endsWith('.') ? '' : '.') +
          ' Hinweis: Unter „users“ → Feld „role“ müssen im PocketBase-Admin alle App-Rollen als Optionen existieren (Migration 1777130000 ausführen oder Select-Werte manuell ergänzen).'
      }
      return res.status(patchRes.status).json({ error: detail || 'Speichern fehlgeschlagen.' })
    }
    const updated = await patchRes.json()
    return res.json(mapPbUser(updated))
  } catch (e) {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }
})

app.delete('/api/users/:id', async (req, res) => {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user || !recordCanManageUsers(user)) {
    return res.status(user ? 403 : 401).json({
      error: user ? 'Nur Administratoren haben Zugriff.' : 'Nicht angemeldet.',
    })
  }
  const id = (req.params.id || '').trim()
  if (user.id === id) {
    return res.status(400).json({ error: 'Sie können sich nicht selbst löschen.' })
  }
  try {
    const delRes = await fetch(
      `${POCKETBASE_URL}/api/collections/${PB_USERS_COLLECTION}/records/${id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${pocketbaseAdminToken}` } }
    )
    if (!delRes.ok) {
      const errBody = await delRes.json().catch(() => ({}))
      return res.status(delRes.status).json({ error: errBody.message || 'Löschen fehlgeschlagen.' })
    }
    return res.status(204).end()
  } catch (e) {
    return res.status(502).json({ error: 'PocketBase nicht erreichbar.' })
  }
})

/** Lokales Kontrollpanel (server.html): nur von diesem Rechner. */
const CONTROL_PB_PORT = 8090
const CONTROL_VITE_PORT = 5173
const managedChild = { pb: null, vite: null }

function controlPbBaseUrl() {
  const base = POCKETBASE_URL || `http://127.0.0.1:${CONTROL_PB_PORT}`
  return String(base).replace(/\/+$/, '')
}

function isLocalControlClient(req) {
  const raw = req.socket?.remoteAddress || req.ip || ''
  const s = String(raw)
  return s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1'
}

function assertLocalControl(req, res, next) {
  if (!isLocalControlClient(req)) {
    return res.status(403).json({ error: 'Nur von localhost erlaubt.' })
  }
  return next()
}

/** Wie /api/users: nur App-Administratoren (role admin / is_admin / manageUsers). */
async function assertControlAdmin(req, res, next) {
  const pbCheck = await requirePocketBase()
  if (!pbCheck.ok) {
    return res.status(pbCheck.status).json({ error: pbCheck.error })
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-auth-token']
  const user = await resolveActorForUserManagement(token)
  if (!user || !recordCanManageUsers(user)) {
    return res.status(user ? 403 : 401).json({
      error: user ? 'Nur Administratoren haben Zugriff.' : 'Nicht angemeldet.',
    })
  }
  return next()
}

function procAlive(child) {
  return Boolean(child && child.exitCode === null && !child.killed)
}

/** Beendet npm-Skript inkl. Kindprozesse (PocketBase, Vite). Nur npm.kill() reicht oft nicht. */
function killNpmScriptTree(child, signal = 'SIGTERM') {
  if (!child || !child.pid) return
  if (process.platform === 'win32') {
    try {
      const k = spawn(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true, detached: true }
      )
      k.unref()
    } catch {
      /* ignore */
    }
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      process.kill(child.pid, signal)
    } catch {
      try {
        if (typeof child.kill === 'function') child.kill(signal)
      } catch {
        /* ignore */
      }
    }
  }
}

function spawnNpmRun(script) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const opts = {
    cwd: __dirname,
    stdio: 'ignore',
    env: { ...process.env },
  }
  if (process.platform !== 'win32') {
    opts.detached = true
  }
  const child = spawn(npmCmd, ['run', script], opts)
  if (process.platform !== 'win32') {
    child.unref()
  }
  return child
}

function attachManaged(slot, child) {
  managedChild[slot] = child
  child.on('exit', () => {
    if (managedChild[slot] === child) managedChild[slot] = null
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function controlCheckPbUp() {
  try {
    const r = await fetch(`${controlPbBaseUrl()}/api/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function controlCheckViteUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONTROL_VITE_PORT}/`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function controlStartPb() {
  if (procAlive(managedChild.pb)) {
    return { ok: true, message: 'PocketBase läuft bereits (vom Panel gestartet).' }
  }
  if (await controlCheckPbUp()) {
    return {
      ok: true,
      message: 'PocketBase ist bereits erreichbar (vermutlich extern gestartet). „Beenden“ geht nur für vom Panel gestartete Instanz.',
    }
  }
  const child = spawnNpmRun('pb')
  attachManaged('pb', child)
  return { ok: true, message: 'PocketBase gestartet (npm run pb).' }
}

async function controlStartVite() {
  if (procAlive(managedChild.vite)) {
    return { ok: true, message: 'Vite läuft bereits (vom Panel gestartet).' }
  }
  if (await controlCheckViteUp()) {
    return {
      ok: true,
      message: 'Vite ist bereits erreichbar (vermutlich extern). „Beenden“ geht nur für vom Panel gestartete Instanz.',
    }
  }
  const child = spawnNpmRun('dev')
  attachManaged('vite', child)
  return { ok: true, message: 'Vite gestartet (npm run dev).' }
}

async function controlStopPb() {
  if (procAlive(managedChild.pb)) {
    const ch = managedChild.pb
    const pid = ch.pid
    managedChild.pb = null
    killNpmScriptTree(ch, 'SIGTERM')
    await sleep(2000)
    if (await controlCheckPbUp()) {
      killNpmScriptTree({ pid }, 'SIGKILL')
      await sleep(600)
      if (await controlCheckPbUp()) {
        return {
          ok: false,
          error:
            'PocketBase antwortet noch auf Port 8090. Prozess ggf. manuell beenden (Activity Monitor / lsof).',
        }
      }
    }
    return { ok: true, message: 'PocketBase-Prozess (inkl. Kinder) beendet.' }
  }
  if (await controlCheckPbUp()) {
    return {
      ok: false,
      error:
        'PocketBase läuft, aber nicht vom Panel gestartet. Bitte im Terminal oder Task-Manager beenden.',
    }
  }
  return { ok: true, message: 'PocketBase war nicht erreichbar.' }
}

async function controlStopVite() {
  if (procAlive(managedChild.vite)) {
    const ch = managedChild.vite
    const pid = ch.pid
    managedChild.vite = null
    killNpmScriptTree(ch, 'SIGTERM')
    await sleep(2000)
    if (await controlCheckViteUp()) {
      killNpmScriptTree({ pid }, 'SIGKILL')
      await sleep(600)
      if (await controlCheckViteUp()) {
        return {
          ok: false,
          error: 'Vite antwortet noch auf Port 5173. Prozess ggf. manuell beenden.',
        }
      }
    }
    return { ok: true, message: 'Vite-Prozess (inkl. Kinder) beendet.' }
  }
  if (await controlCheckViteUp()) {
    return {
      ok: false,
      error: 'Vite läuft, aber nicht vom Panel gestartet. Bitte im Terminal beenden (Ctrl+C).',
    }
  }
  return { ok: true, message: 'Vite war nicht erreichbar.' }
}

async function controlRestartPb() {
  if (procAlive(managedChild.pb)) {
    const ch = managedChild.pb
    const pid = ch.pid
    managedChild.pb = null
    killNpmScriptTree(ch, 'SIGTERM')
    await sleep(2000)
    if (await controlCheckPbUp()) {
      killNpmScriptTree({ pid }, 'SIGKILL')
      await sleep(800)
    }
  } else if (await controlCheckPbUp()) {
    return {
      ok: false,
      error:
        'PocketBase läuft extern. Zuerst den anderen Prozess beenden, dann erneut „Neu starten“ oder „Start“.',
    }
  }
  const child = spawnNpmRun('pb')
  attachManaged('pb', child)
  return { ok: true, message: 'PocketBase neu gestartet (Panel).' }
}

async function controlRestartVite() {
  if (procAlive(managedChild.vite)) {
    const ch = managedChild.vite
    const pid = ch.pid
    managedChild.vite = null
    killNpmScriptTree(ch, 'SIGTERM')
    await sleep(2000)
    if (await controlCheckViteUp()) {
      killNpmScriptTree({ pid }, 'SIGKILL')
      await sleep(800)
    }
  } else if (await controlCheckViteUp()) {
    return {
      ok: false,
      error: 'Vite läuft extern. Zuerst den anderen Prozess beenden, dann erneut „Neu starten“.',
    }
  }
  const child = spawnNpmRun('dev')
  attachManaged('vite', child)
  return { ok: true, message: 'Vite neu gestartet (Panel).' }
}

app.get('/api/control/status', assertLocalControl, assertControlAdmin, async (_req, res) => {
  try {
    const [pbUp, viteUp] = await Promise.all([controlCheckPbUp(), controlCheckViteUp()])
    return res.json({
      express: { up: true, port: Number(port) },
      pocketbase: {
        up: pbUp,
        port: CONTROL_PB_PORT,
        managedByPanel: procAlive(managedChild.pb),
      },
      vite: {
        up: viteUp,
        port: CONTROL_VITE_PORT,
        managedByPanel: procAlive(managedChild.vite),
      },
    })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
})

app.post('/api/control/action', assertLocalControl, assertControlAdmin, async (req, res) => {
  const action = String(req.body?.action || '').toLowerCase()
  const rawTarget = String(req.body?.target || '').toLowerCase()
  const target = rawTarget === 'pocketbase' ? 'pb' : rawTarget

  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Ungültige action (start|stop|restart).' })
  }
  if (!['pb', 'vite', 'all', 'express'].includes(target)) {
    return res.status(400).json({ error: 'Ungültiges target (pb|vite|all|express).' })
  }

  if (target === 'express') {
    return res.json({
      message:
        'Dieser Express-Server kann sich hier nicht selbst beenden. Bitte im Terminal mit Ctrl+C beenden und mit npm run server neu starten.',
    })
  }

  const runOne = async (t) => {
    if (t === 'pb') {
      if (action === 'start') return controlStartPb()
      if (action === 'stop') return controlStopPb()
      return controlRestartPb()
    }
    if (action === 'start') return controlStartVite()
    if (action === 'stop') return controlStopVite()
    return controlRestartVite()
  }

  if (target !== 'all') {
    const r = await runOne(target)
    if (!r.ok) return res.status(400).json({ error: r.error })
    return res.json({ message: r.message })
  }

  const pbR = await runOne('pb')
  const viteR = await runOne('vite')
  const errors = [pbR, viteR].filter((x) => !x.ok).map((x) => x.error)
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' — ') })
  }
  const messages = [pbR.message, viteR.message].filter(Boolean)
  return res.json({ message: messages.join(' · ') })
})

// Gebautes Frontend ausliefern (Express 5: Catch-all als benannter Parameter)
const distDir = path.join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  app.get('/backend', (_req, res) => {
    res.sendFile(path.join(distDir, 'backend.html'))
  })
  app.get('/server.html', (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.sendFile(path.join(distDir, 'server.html'))
  })
  app.get('/server', (_req, res) => {
    res.redirect(302, '/server.html')
  })
  app.use(express.static(distDir))
  app.get('/{*path}', (req, res) => {
    const p = String(req.path || '')
    if (p.startsWith('/api/')) {
      return res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' })
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const tlsOpts = resolveTlsOptions()
const urlScheme = tlsOpts ? 'https' : 'http'
const httpServer = tlsOpts ? https.createServer(tlsOpts, app) : http.createServer(app)

httpServer.listen(port, () => {
  console.log(`Backend läuft auf ${urlScheme}://localhost:${port}`)
  console.log(
    `API /api/health liefert expressApi — Rechnungs-PDF-Import. Wird im Magazin ein alter Stand vermutet: ` +
      `im Terminal „npm run server“ beenden (Ctrl+C) und im Projektordner neu starten.`
  )
  if (!tlsOpts) {
    console.log(
      'Barcode-Kamera: Unter http:// und Ihrer LAN-IP (z. B. 192.168.…) sperrt der Browser die Kamera. ' +
        'Lege TLS-Zertifikate an und starte neu, dann https://<LAN-IP>:' +
        port +
        ' – rein lokal, ohne öffentliches Internet.'
    )
    console.log(
      'Zertifikat (Beispiel, LAN-IP anpassen): mkdir -p certs && openssl req -x509 -newkey rsa:2048 -nodes ' +
        '-keyout certs/key.pem -out certs/cert.pem -days 825 -subj "/CN=localhost" ' +
        '-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.0.42"'
    )
  } else {
    console.log(
      `HTTPS aktiv: Im Smartphone https://<Ihre-LAN-IP>:${port} öffnen. Beim ersten Mal Zertifikat vertrauen – Verbindung bleibt im eigenen Netz.`
    )
  }
  if (!POCKETBASE_URL) {
    console.warn('POCKETBASE_URL fehlt – Login, Registrierung und Nutzerverwaltung funktionieren nicht.')
  } else {
    getPocketBaseAdminToken()
      .then(async (token) => {
        pocketbaseAdminToken = token
        if (token) console.log('PocketBase Admin verbunden.')
        else
          console.warn(
            'PocketBase Admin-Token fehlgeschlagen. Prüfe POCKETBASE_ADMIN_EMAIL und POCKETBASE_ADMIN_PASSWORD.'
          )
        if (token) {
          const boot = await runTenantBootstrap(process.env)
          if (boot.steps?.length) {
            for (const line of boot.steps) console.log(`[tenant-bootstrap] ${line}`)
          }
          if (!boot.ok && !boot.skipped) {
            console.warn('[tenant-bootstrap] Fehler:', boot.error)
          }
        }
      })
      .catch((e) => console.warn('PocketBase:', e.message))
  }
  if (fs.existsSync(distDir)) {
    console.log('Frontend wird von diesem Server ausgeliefert (dist).')
    console.log(`Server-Control: ${urlScheme}://localhost:${port}/server.html`)
  } else {
    console.log('Hinweis: "npm run build" ausführen, dann "npm start" – dann läuft alles unter einer Adresse.')
  }
})
