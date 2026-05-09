import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Menu, Search, X } from 'lucide-react'
import './App.css'
import MagazinPage from './backend/magazin/MagazinPage.jsx'
import { normalizeStueckProLiefergebinde } from './backend/magazin/types.js'
import LagerverwaltungPage from './components/LagerverwaltungPage.jsx'
import MitarbeiterView from './components/MitarbeiterView.jsx'
import MailSmtpSettingsPage from './components/MailSmtpSettingsPage.jsx'
import AccountSettingsPage from './components/AccountSettingsPage.jsx'
import ArticleView from './components/ArticleView.jsx'
import LoginView from './components/LoginView.jsx'
import { InventurDashboard } from './components/InventurDashboard.jsx'
import { LastInventurView } from './components/LastInventurView.jsx'
import { avatarInitials } from './lib/avatarInitials'
import { mapPbRecordToArticle, mapPbRecordToUser, pb } from './lib/pocketbase'
import { userCan } from './lib/userCapabilities'
import { pocketBaseFullErrorMessage, pocketBaseMergedResponse } from './lib/pocketBaseErrorMessage'
import { PB_COLLECTIONS } from './lib/pocketbaseCollections'
import { archiveCountedPositionsToInventurArchiv } from './lib/inventurArchiv'
import { resolvePositionenForSessionEnd } from './lib/sessionSnapshot'
import { deleteZaehlungPositionsForSession } from './lib/zaehlungPosition'
import { userCanEndZaehlSession } from './lib/zaehlSessionAccess'
import {
  fetchUnterlagerOptionsForZaehlen,
  formatUnterlagerLabel,
  formatUnterlagerNameOnly,
} from './lib/lagerAccess'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { ClientResponseError, getTokenPayload, isTokenExpired } from 'pocketbase'
import { Toaster } from 'sonner'

const ZAEHL_SESSION_STORAGE_KEY = 'vibe-inventur-zaehl-session-id'
const APP_VIEW_STORAGE_KEY = 'vibe-inventur-app-view'

/**
 * Mandanten-ID für Schreibzugriffe: zuerst JWT (entspricht @request.auth.tenant_id in Rules),
 * dann App-State / Auth-Model — sonst fehlt tenant_id im Payload trotz gesetztem Token.
 */
function resolveArtikelWriterTenantId(pb, currentUser) {
  let j = getTokenPayload(pb.authStore.token)?.tenant_id
  if (j != null && typeof j === 'object' && j.id) j = j.id
  const fromJwt = String(j ?? '').trim()
  if (fromJwt) return fromJwt
  /** Auth-Store vor React-State: sonst fehlende tenant_id im Create-Body trotz gesetztem Konto. */
  const raw = pb.authStore.model?.tenant_id
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object' && raw.id) return String(raw.id).trim()
  const fromUser = String(currentUser?.tenantId ?? '').trim()
  if (fromUser) return fromUser
  return ''
}

/**
 * API-Regel tenantOk auf `artikel`: bei gesetztem Mandant muss der Datensatz dieselbe tenant_id haben.
 * Alte/leere Datensätze scheitern sonst bei Update/Archiv/Batch mit generischem 400.
 */
async function buildArtikelTenantIdPatch(pb, currentUser) {
  const tenantId = resolveArtikelWriterTenantId(pb, currentUser)
  if (!tenantId) return { ok: true, patch: {} }
  try {
    await pb.collection(PB_COLLECTIONS.standorte).getOne(tenantId, { requestKey: null })
    return { ok: true, patch: { tenant_id: tenantId } }
  } catch {
    return {
      ok: false,
      patch: {},
      message:
        'Mandant (Standort) am Konto ist ungültig oder nicht lesbar. Bitte Administrator:in oder PocketBase prüfen.',
    }
  }
}

function lagerIdFromUnterlagerRecord(ul) {
  const raw = ul?.lager
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object' && raw.id) return String(raw.id).trim()
  return ''
}

/**
 * Lager/Unterlager konsistent setzen: nur Unterlager → Parent-Lager nachladen;
 * bei Widerspruch Lager an das Unterlager anpassen (sonst oft 400 von PocketBase).
 */
async function normalizeArtikelLagerFields(pb, lidRaw, ulidRaw) {
  let lid = String(lidRaw ?? '').trim()
  const ulid = String(ulidRaw ?? '').trim()
  if (!ulid) {
    return { ok: true, lid, ulid: '' }
  }
  try {
    const ul = await pb.collection(PB_COLLECTIONS.unterlager).getOne(ulid, {
      fields: 'lager',
      requestKey: null,
    })
    const parent = lagerIdFromUnterlagerRecord(ul)
    if (!parent) {
      return {
        ok: false,
        lid: '',
        ulid,
        message: 'Unterlager hat kein zugeordnetes Lager (Daten in PocketBase prüfen).',
      }
    }
    if (!lid || lid !== parent) {
      lid = parent
    }
    return { ok: true, lid, ulid }
  } catch {
    return {
      ok: false,
      lid: '',
      ulid,
      message: 'Unterlager nicht gefunden oder keine Berechtigung zum Lesen (API-Regeln „unterlager“).',
    }
  }
}

/** Vergleich gescannt vs. gespeichert (Trim, optional nur Ziffern – z. B. führende Nullen/Format). */
function barcodesMatch(storedRaw, scannedRaw) {
  const a = String(storedRaw ?? '').trim()
  const b = String(scannedRaw ?? '').trim()
  if (!a || !b) return false
  if (a === b) return true
  const da = a.replace(/\D/g, '')
  const db = b.replace(/\D/g, '')
  if (!da || !db) return false
  return da === db
}

/**
 * Artikelkacheln / Zähler-Kopfzeile nur bei index.html (data-vibe-entry="counting").
 * backend.html erzwingt false – auch wenn eine Zählsession in sessionStorage wiederhergestellt wird.
 */
function resolveCountingEntryUi(countingAppProp) {
  if (typeof document === 'undefined') return Boolean(countingAppProp)
  const vibe = document.documentElement.getAttribute('data-vibe-entry')
  if (vibe === 'backend') return false
  if (vibe === 'counting') return true
  return Boolean(countingAppProp)
}

function readStoredAppView(countingApp) {
  try {
    const v = sessionStorage.getItem(APP_VIEW_STORAGE_KEY)
    if (
      v === 'admin' ||
      v === 'lager' ||
      v === 'default' ||
      v === 'mitarbeiter' ||
      v === 'mail' ||
      v === 'account'
    ) {
      if (countingApp && (v === 'admin' || v === 'lager' || v === 'mitarbeiter')) {
        return 'default'
      }
      return v
    }
  } catch {
    /* z. B. privates Fenster */
  }
  return 'default'
}

function pickViewAfterLogin(user, countingApp) {
  if (!user) return 'default'
  const stored = readStoredAppView(countingApp)
  if (countingApp) {
    if (stored === 'account') return 'account'
    if (stored === 'mail' && userCan(user, 'manageUsers')) return 'mail'
    return 'default'
  }
  if (stored === 'mitarbeiter' && userCan(user, 'manageUsers')) return 'mitarbeiter'
  if (stored === 'mail' && userCan(user, 'manageUsers')) return 'mail'
  if (stored === 'account') return 'account'
  if (userCan(user, 'magazin:read') && stored === 'lager') return 'lager'
  if (userCan(user, 'magazin:read') && stored === 'admin') return 'admin'
  if (!userCan(user, 'inventur') && userCan(user, 'magazin:read')) return 'admin'
  return 'default'
}

/** PocketBase List-Filter: String-Wert in Anführungszeichen escapen. */
function pbFilterQuotedString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')}"`
}

/**
 * Ohne Artikelnummer aber mit Barcode: erste 5 Ziffern des Barcodes als Präfix.
 */
function artikelnummerFallbackFromBarcode(barcodeRaw) {
  const b = String(barcodeRaw ?? '').trim()
  if (!b) return ''
  const digits = b.replace(/\D/g, '').slice(0, 5)
  const suffix = digits || b.replace(/[^\dA-Za-z._-]/g, '').slice(0, 5) || 'X'
  return `BC-${suffix}`
}

function parsePreisInput(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** Für PocketBase: NaN wird per JSON zu null → „validation_required“ / Cannot be blank. */
function coercePreisForPocketBase(raw) {
  if (raw == null || raw === '') return NaN
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  if (typeof raw === 'bigint') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : NaN
  }
  return parsePreisInput(raw)
}

/**
 * JSON-Body für artikel create/update. `preis` immer als endliche Zahl (kein null durch NaN).
 */
function artikelRecordBody(fields) {
  const body = {}
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue
    if (key === 'preis') {
      const n = typeof val === 'number' ? val : Number(val)
      if (Number.isFinite(n) && n >= 0) body.preis = n
      continue
    }
    body[key] = val
  }
  return body
}

function pbBearerAuthHeader() {
  const t = String(pb.authStore.token || '').trim()
  if (!t) return {}
  return { Authorization: t.startsWith('Bearer ') ? t : `Bearer ${t}` }
}

/** Direkter REST-Call wie curl — umgeht seltene SDK-/Proxy-Pfade, bei denen `preis` nicht ankommt. */
async function pbArtikelPatchJson(collectionIdOrName, recordId, body) {
  const base = String(pb.baseUrl || '').replace(/\/$/, '')
  const url = `${base}/api/collections/${encodeURIComponent(collectionIdOrName)}/records/${encodeURIComponent(recordId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...pbBearerAuthHeader() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ClientResponseError({ status: res.status, response: data })
  return data
}

async function pbArtikelCreateJson(collectionIdOrName, body) {
  const base = String(pb.baseUrl || '').replace(/\/$/, '')
  const url = `${base}/api/collections/${encodeURIComponent(collectionIdOrName)}/records`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...pbBearerAuthHeader() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ClientResponseError({ status: res.status, response: data })
  return data
}

/** Nur Entwicklung: in `.env` `VITE_DEBUG_PB_ARTICLE_SAVE=true`, Dev-Server neu starten, Konsole offen beim Speichern. */
function debugLogPbArtikelSave(action, collectionId, plain) {
  if (!import.meta.env.DEV) return
  if (String(import.meta.env.VITE_DEBUG_PB_ARTICLE_SAVE || '').toLowerCase() !== 'true') return
  console.info('[vibe-inventur PB artikel]', {
    action,
    collection: collectionId,
    pbBaseUrl: pb.baseUrl,
    plain,
    jsonBody: artikelRecordBody(plain),
  })
}

async function fetchOpenFoodFactsName(barcode) {
  const code = String(barcode ?? '').trim()
  if (!code) return ''
  try {
    /* Server-Proxy (server.mjs): vermeidet Browser-CORS; Vite leitet /api → Express. */
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

function App({ countingApp = false } = {}) {
  const PB_ARTICLES_COLLECTION = PB_COLLECTIONS.artikel
  const countingEntryUi = resolveCountingEntryUi(countingApp)

  const [view, setView] = useState(() => readStoredAppView(countingApp))
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const settingsMenuRef = useRef(null)
  const categoryNavRef = useRef(null)
  const articleInventoryRef = useRef(null)
  const [currentUser, setCurrentUser] = useState(() => mapPbRecordToUser(pb.authStore.model))
  /** PocketBase-Auth ist beim Client-Start synchron auslesbar → kein extra „leerer“ Erstrahmen. */
  const [authReady] = useState(true)
  const [items, setItems] = useState([])
  const [archivedItems, setArchivedItems] = useState([])
  const [loadError, setLoadError] = useState('')
  const [manualCategories, setManualCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('Alle')
  const [artikelSearchQuery, setArtikelSearchQuery] = useState('')
  const [zaehlSessionId, setZaehlSessionId] = useState(null)
  /** PocketBase `zaehl_sessions.session_owner` der aktiven Session (für „Fertig“-Berechtigung). */
  const [activeSessionOwnerId, setActiveSessionOwnerId] = useState(null)
  /** Nur Zähler-App (index.html): '' | 'u:<unterlagerId>' (kein Lager-Gesamt mehr) */
  const [zaehlScopeValue, setZaehlScopeValue] = useState('')
  const [zaehlScopeUnterlagers, setZaehlScopeUnterlagers] = useState([])
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionMessage, setSessionMessage] = useState('')
  const [zaehlungSyncError, setZaehlungSyncError] = useState('')
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false)
  const [tenantStandort, setTenantStandort] = useState(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  /** Nach Barcode-Treffer: Karte in der Liste fokussieren (wird nach Scroll zurückgesetzt). */
  const [barcodeScrollArticleId, setBarcodeScrollArticleId] = useState(null)
  const [barcodeLookupName, setBarcodeLookupName] = useState('')
  const [barcodeLookupBusy, setBarcodeLookupBusy] = useState(false)
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState('')
  const [barcodeScannerMessage, setBarcodeScannerMessage] = useState('')
  const [barcodeScannerActive, setBarcodeScannerActive] = useState(false)
  const [barcodeCreateDraft, setBarcodeCreateDraft] = useState({
    preisInput: '',
    einheit: 'Stk',
    category: '',
  })
  /** Barcode unbekannt: „Neu anlegen“ vs. „Bestehenden verknüpfen“. */
  const [barcodeLinkMode, setBarcodeLinkMode] = useState('create')
  const [barcodeLinkSearch, setBarcodeLinkSearch] = useState('')
  const [barcodeLinkSelectedId, setBarcodeLinkSelectedId] = useState(null)
  const [lastInventurRefresh, setLastInventurRefresh] = useState(0)
  const prevAuthUserIdRef = useRef(null)
  const barcodeVideoRef = useRef(null)
  const barcodeStreamRef = useRef(null)
  const barcodeRafRef = useRef(0)
  const barcodeScanLockRef = useRef(false)
  const barcodeZxingControlsRef = useRef(null)
  const barcodeDialogInputRef = useRef(null)

  const effectiveZaehlScope = countingApp ? zaehlScopeValue : ''

  const canEndActiveZaehlSession = useMemo(
    () => userCanEndZaehlSession(currentUser, { session_owner: activeSessionOwnerId }),
    [currentUser, activeSessionOwnerId]
  )

  const categories = useMemo(() => {
    const fromItems = items
      .map((item) => item.category)
      .filter((category) => typeof category === 'string' && category.length > 0)
    return [...new Set([...fromItems, ...manualCategories])]
  }, [items, manualCategories])

  const barcodeLinkCandidates = useMemo(() => {
    const q = String(barcodeLinkSearch ?? '')
      .trim()
      .toLowerCase()
    return items
      .filter((it) => it && !it.archived)
      .filter((it) => {
        if (!q) return true
        const name = String(it.name ?? '').toLowerCase()
        const nr = String(it.artikelnummer ?? '').toLowerCase()
        const cat = String(it.category ?? '').toLowerCase()
        const bc = String(it.barcode ?? '').toLowerCase()
        return name.includes(q) || nr.includes(q) || cat.includes(q) || bc.includes(q)
      })
      .slice(0, 100)
  }, [items, barcodeLinkSearch])

  useEffect(() => {
    setSelectedCategory('Alle')
    setArtikelSearchQuery('')
  }, [effectiveZaehlScope])

  useEffect(() => {
    if (!countingApp || !zaehlSessionId || !currentUser) {
      setZaehlScopeUnterlagers([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const uls = await fetchUnterlagerOptionsForZaehlen(pb, currentUser)
        if (!cancelled) setZaehlScopeUnterlagers(Array.isArray(uls) ? uls : [])
      } catch {
        if (!cancelled) setZaehlScopeUnterlagers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [countingApp, zaehlSessionId, currentUser])

  useEffect(() => {
    if (countingApp && zaehlScopeValue.startsWith('l:')) {
      setZaehlScopeValue('')
    }
  }, [countingApp, zaehlScopeValue])

  useEffect(() => {
    const applyAuthState = () => {
      setCurrentUser(mapPbRecordToUser(pb.authStore.model))
    }
    applyAuthState()
    const unsubscribe = pb.authStore.onChange(() => applyAuthState(), true)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  useEffect(() => {
    const tid = String(currentUser?.tenantId ?? '').trim()
    let cancelled = false
    if (tid) {
      pb.collection(PB_COLLECTIONS.standorte)
        .getOne(tid, { requestKey: null })
        .then((rec) => { if (!cancelled) setTenantStandort(rec) })
        .catch(() => { if (!cancelled) setTenantStandort(null) })
    } else if (currentUser && userCan(currentUser, 'manageUsers')) {
      pb.collection(PB_COLLECTIONS.standorte)
        .getFirstListItem('', { sort: 'name', requestKey: null })
        .then((rec) => { if (!cancelled) setTenantStandort(rec) })
        .catch(() => { if (!cancelled) setTenantStandort(null) })
    } else {
      setTenantStandort(null)
    }
    return () => { cancelled = true }
  }, [currentUser?.tenantId, currentUser?.capabilities])

  useEffect(() => {
    if (!authReady) return
    try {
      sessionStorage.setItem(APP_VIEW_STORAGE_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view, authReady])

  useEffect(() => {
    if (currentUser && view === 'admin' && !userCan(currentUser, 'magazin:read')) {
      setView('default')
    }
  }, [currentUser, view])

  useEffect(() => {
    if (currentUser && view === 'lager' && !userCan(currentUser, 'magazin:read')) {
      setView('default')
    }
  }, [currentUser, view])

  useEffect(() => {
    if (currentUser && view === 'mitarbeiter' && !userCan(currentUser, 'manageUsers')) {
      setView(userCan(currentUser, 'magazin:read') ? 'admin' : 'default')
    }
  }, [currentUser, view])

  useEffect(() => {
    if (currentUser && view === 'mail' && !userCan(currentUser, 'manageUsers')) {
      setView(userCan(currentUser, 'magazin:read') ? 'admin' : 'default')
    }
  }, [currentUser, view])

  useEffect(() => {
    if (!settingsMenuOpen) return
    const onDown = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setSettingsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [settingsMenuOpen])

  useEffect(() => {
    if (!menuOpen) setSettingsMenuOpen(false)
  }, [menuOpen])

  useEffect(() => {
    const id = currentUser?.id ?? null
    if (id && prevAuthUserIdRef.current == null) {
      setView(pickViewAfterLogin(currentUser, countingApp))
      setMenuOpen(false)
    }
    prevAuthUserIdRef.current = id
  }, [currentUser, countingApp])

  useEffect(() => {
    if (!currentUser || countingApp) return
    if (!userCan(currentUser, 'inventur') && userCan(currentUser, 'magazin:read')) {
      setView((v) => (v === 'default' ? 'admin' : v))
    }
  }, [currentUser, countingApp])

  useEffect(() => {
    if (!countingApp || !currentUser) return
    if (view === 'admin' || view === 'lager' || view === 'mitarbeiter') {
      setView('default')
    }
  }, [countingApp, currentUser, view])

  useEffect(() => {
    if (!currentUser) {
      setItems([])
      setLoadError('')
      return
    }
    const loadArticles = async () => {
      try {
        setLoadError('')
        const records = await pb.collection(PB_ARTICLES_COLLECTION).getFullList({
          sort: 'name',
          requestKey: null,
        })
        const allMapped = records
          .map((record) => mapPbRecordToArticle(record))
          .filter((item) => item && item.name)
        setItems(allMapped.filter((item) => !item.archived))
        setArchivedItems(allMapped.filter((item) => item.archived))
      } catch (e) {
        setItems([])
        const detail = pocketBaseFullErrorMessage(e)
        let msg =
          'Artikel konnten nicht aus PocketBase geladen werden. Prüfe: PocketBase läuft, Collection „artikel“, API Rules.'
        if (detail && detail !== 'Unbekannter Fehler.') {
          msg += ' — ' + detail
        }
        if (import.meta.env.DEV && !import.meta.env.VITE_POCKETBASE_URL) {
          msg +=
            ' Unter Vite: Entweder in `.env` VITE_POCKETBASE_URL=http://127.0.0.1:8090 setzen (und in PB CORS localhost:5173 erlauben) oder parallel `npm run server` starten.'
        }
        if (import.meta.env.DEV) {
          console.error('[loadArticles]', pb.baseUrl, e)
        }
        setLoadError(msg)
      }
    }
    loadArticles()
  }, [PB_ARTICLES_COLLECTION, currentUser])

  useEffect(() => {
    if (!currentUser) {
      setZaehlSessionId(null)
      return
    }
    let cancelled = false

    const tryResumeSession = async (id) => {
      if (!id || cancelled) return false
      try {
        const rec = await pb.collection(PB_COLLECTIONS.zaehlSessions).getOne(id)
        if (rec.ended) {
          sessionStorage.removeItem(ZAEHL_SESSION_STORAGE_KEY)
          return false
        }
        sessionStorage.setItem(ZAEHL_SESSION_STORAGE_KEY, id)
        setZaehlSessionId(id)
        return true
      } catch {
        sessionStorage.removeItem(ZAEHL_SESSION_STORAGE_KEY)
        return false
      }
    }

    ;(async () => {
      const params = new URLSearchParams(window.location.search)
      const fromUrl = (params.get('session') || params.get('zaehlSession') || '').trim()
      const fromStorage = (sessionStorage.getItem(ZAEHL_SESSION_STORAGE_KEY) || '').trim()

      if (await tryResumeSession(fromUrl)) return
      if (await tryResumeSession(fromStorage)) return
    })()

    return () => {
      cancelled = true
    }
  }, [currentUser])

  useEffect(() => {
    if (!zaehlSessionId) {
      setActiveSessionOwnerId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const rec = await pb.collection(PB_COLLECTIONS.zaehlSessions).getOne(zaehlSessionId, {
          fields: 'session_owner,ended',
          expand: 'session_owner',
          requestKey: null,
        })
        if (cancelled) return
        const raw = rec.session_owner
        const oid =
          typeof raw === 'string' && raw.trim()
            ? raw.trim()
            : raw && typeof raw === 'object' && raw.id
              ? String(raw.id).trim()
              : ''
        setActiveSessionOwnerId(oid || null)
      } catch {
        if (!cancelled) setActiveSessionOwnerId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [zaehlSessionId])

  useEffect(() => {
    if (categoryNavRef.current && view === 'default') {
      categoryNavRef.current.scrollLeft = 0
    }
  }, [categories, view])

  const handleAddCategory = (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setManualCategories((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
  }

  /** Alle Artikel mit Kategorie `from` → `to`; Inventur-Tabs (`manualCategories`) mitziehen. */
  const handleRenameCategory = async (fromRaw, toRaw) => {
    const from = String(fromRaw ?? '').trim()
    const to = String(toRaw ?? '').trim()
    if (!from || !to) {
      return { ok: false, message: 'Alter und neuer Kategoriename dürfen nicht leer sein.' }
    }
    if (from === to) {
      return { ok: false, message: 'Der neue Name ist identisch mit dem alten.' }
    }

    const affected = items.filter((item) => String(item.category ?? '').trim() === from)

    if (affected.length === 0) {
      setManualCategories((prev) => {
        if (!prev.includes(from)) return prev
        const without = prev.filter((c) => c !== from)
        return without.includes(to) ? without : [...without, to]
      })
      handleAddCategory(to)
      setSelectedCategory((sel) => (sel === from ? to : sel))
      return { ok: true, from, to, updated: 0, updatedIds: [] }
    }

    const tenantRes = await buildArtikelTenantIdPatch(pb, currentUser)
    if (!tenantRes.ok) {
      return {
        ok: false,
        from,
        to,
        updated: 0,
        updatedIds: [],
        message: tenantRes.message,
      }
    }
    const tenantPatch = tenantRes.patch

    const BATCH = 6
    const updatedMaps = []
    const errors = []

    for (let i = 0; i < affected.length; i += BATCH) {
      const chunk = affected.slice(i, i + BATCH)
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          try {
            const rec = await pb.collection(PB_ARTICLES_COLLECTION).update(
              item.id,
              {
                artikelnummer: item.artikelnummer,
                name: item.name,
                preis: item.preis,
                einheit: String(item.einheit ?? '').trim() || 'Stk',
                category: to,
                lager: item.lagerId || null,
                unterlager: item.unterlagerId || null,
                ...tenantPatch,
              },
              { requestKey: null }
            )
            const mapped = mapPbRecordToArticle(rec)
            if (!mapped) return { ok: false, id: item.id, message: 'Antwort ungültig.' }
            return { ok: true, mapped }
          } catch (e) {
            return { ok: false, id: item.id, message: pocketBaseFullErrorMessage(e) }
          }
        })
      )
      for (const r of chunkResults) {
        if (r.ok && r.mapped) updatedMaps.push(r.mapped)
        else if (!r.ok) errors.push({ id: r.id, message: r.message })
        else errors.push({ id: undefined, message: 'Antwort ungültig.' })
      }
    }

    if (updatedMaps.length) {
      setItems((prev) => {
        const byId = new Map(updatedMaps.map((m) => [m.id, m]))
        const next = prev.map((x) => byId.get(x.id) ?? x)
        return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      })
    }

    const updatedIds = updatedMaps.map((m) => m.id)

    if (errors.length && updatedMaps.length === 0) {
      return {
        ok: false,
        from,
        to,
        updated: 0,
        updatedIds: [],
        message: `Kategorie konnte nicht umbenannt werden (${errors.length} Fehler).`,
      }
    }

    setManualCategories((prev) => {
      if (!prev.includes(from)) return prev
      const without = prev.filter((c) => c !== from)
      return without.includes(to) ? without : [...without, to]
    })
    handleAddCategory(to)
    setSelectedCategory((sel) => (sel === from ? to : sel))

    if (errors.length) {
      const failed = errors.length
      const okCount = updatedMaps.length
      return {
        ok: false,
        from,
        to,
        updated: okCount,
        updatedIds,
        message: `${okCount} Artikel umbenannt, ${failed} fehlgeschlagen.`,
      }
    }

    return { ok: true, from, to, updated: updatedMaps.length, updatedIds }
  }

  /** Kategorie entfernen: Tab aus `manualCategories`; bei Artikeln `category` leeren. */
  const handleDeleteCategory = async (nameRaw) => {
    const name = String(nameRaw ?? '').trim()
    if (!name) {
      return { ok: false, message: 'Ungültige Kategorie.' }
    }

    const affected = items.filter((item) => String(item.category ?? '').trim() === name)

    if (affected.length === 0) {
      setManualCategories((prev) => prev.filter((c) => c !== name))
      setSelectedCategory((sel) => (sel === name ? 'Alle' : sel))
      return { ok: true, name, updated: 0, updatedIds: [] }
    }

    const tenantResDel = await buildArtikelTenantIdPatch(pb, currentUser)
    if (!tenantResDel.ok) {
      return { ok: false, name, updated: 0, updatedIds: [], message: tenantResDel.message }
    }
    const tenantPatchDel = tenantResDel.patch

    const BATCH = 6
    const updatedMaps = []
    const errors = []

    for (let i = 0; i < affected.length; i += BATCH) {
      const chunk = affected.slice(i, i + BATCH)
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          try {
            const rec = await pb.collection(PB_ARTICLES_COLLECTION).update(
              item.id,
              {
                artikelnummer: item.artikelnummer,
                name: item.name,
                preis: item.preis,
                einheit: String(item.einheit ?? '').trim() || 'Stk',
                category: '',
                lager: item.lagerId || null,
                unterlager: item.unterlagerId || null,
                ...tenantPatchDel,
              },
              { requestKey: null }
            )
            const mapped = mapPbRecordToArticle(rec)
            if (!mapped) return { ok: false, id: item.id, message: 'Antwort ungültig.' }
            return { ok: true, mapped }
          } catch (e) {
            return { ok: false, id: item.id, message: pocketBaseFullErrorMessage(e) }
          }
        })
      )
      for (const r of chunkResults) {
        if (r.ok && r.mapped) updatedMaps.push(r.mapped)
        else if (!r.ok) errors.push({ id: r.id, message: r.message })
        else errors.push({ id: undefined, message: 'Antwort ungültig.' })
      }
    }

    if (updatedMaps.length) {
      setItems((prev) => {
        const byId = new Map(updatedMaps.map((m) => [m.id, m]))
        const next = prev.map((x) => byId.get(x.id) ?? x)
        return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      })
    }

    const updatedIds = updatedMaps.map((m) => m.id)

    if (errors.length && updatedMaps.length === 0) {
      return {
        ok: false,
        name,
        updated: 0,
        updatedIds: [],
        message: `Kategorie konnte nicht entfernt werden (${errors.length} Fehler).`,
      }
    }

    setManualCategories((prev) => prev.filter((c) => c !== name))
    setSelectedCategory((sel) => (sel === name ? 'Alle' : sel))

    if (errors.length) {
      const failed = errors.length
      const okCount = updatedMaps.length
      return {
        ok: false,
        name,
        updated: okCount,
        updatedIds,
        message: `Bei ${okCount} Artikeln entfernt, ${failed} fehlgeschlagen.`,
      }
    }

    return { ok: true, name, updated: updatedMaps.length, updatedIds }
  }

  const handleCreateArtikel = async ({
    artikelnummer,
    barcode,
    name,
    preis,
    einheit,
    category,
    lagerId,
    unterlagerId,
    stueckProLiefergebinde,
    lieferantenArtnr,
  }) => {
    const nr = String(artikelnummer ?? '').trim()
    const nm = String(name ?? '').trim()
    if (!nm) {
      return { ok: false, message: 'Name ist ein Pflichtfeld.' }
    }
    const preisNum = coercePreisForPocketBase(preis)
    if (!Number.isFinite(preisNum) || preisNum < 0) {
      return { ok: false, message: 'Preis ungültig oder fehlt (Zahl ≥ 0, z. B. 0 oder 1,99).' }
    }
    if (!userCan(currentUser, 'magazin:write') && !userCan(currentUser, 'inventur')) {
      return {
        ok: false,
        message:
          'Keine Berechtigung zum Anlegen von Artikeln (Rolle „Inventur“ oder „Lagerleiter“/Admin nötig).',
      }
    }
    const ein = String(einheit ?? '').trim() || 'Stk'
    const bc = String(barcode ?? '').trim()
    const catTrim = String(category ?? '').trim()

    let nrEff = nr
    if (!nrEff && bc) {
      nrEff = artikelnummerFallbackFromBarcode(bc)
    }
    const skipArtikelnummerDuplicateLookup = false

    if (nrEff && !skipArtikelnummerDuplicateLookup) {
      let existing = items.find((i) => String(i.artikelnummer ?? '').trim() === nrEff)
      if (!existing) {
        try {
          const filter = `artikelnummer=${pbFilterQuotedString(nrEff)}`
          const rec = await pb.collection(PB_ARTICLES_COLLECTION).getFirstListItem(filter, {
            requestKey: null,
          })
          existing = mapPbRecordToArticle(rec)
        } catch (lookupErr) {
          if (import.meta.env.DEV && lookupErr?.status !== 404) {
            console.warn('[handleCreateArtikel] artikelnummer lookup', lookupErr?.status, lookupErr)
          }
        }
      }
      if (existing) {
        const archHint = existing.archived ? ' (archivierter Artikel, nicht in der Liste)' : ''
        const ok = window.confirm(
          `Die Artikelnummer „${nrEff}“ ist bereits vergeben${archHint} (aktuell: „${existing.name}“).\n\nSoll der Artikel mit den neuen Angaben aktualisiert werden (Name, Einheit, Preis, Kategorie)?`
        )
        if (!ok) {
          return { ok: false, message: 'Anlegen abgebrochen.' }
        }
        return handleUpdateArtikel({
          id: existing.id,
          artikelnummer: nrEff,
          name: nm,
          preis: preisNum,
          einheit: ein,
          category: catTrim,
          lagerId: lagerId ?? existing.lagerId ?? '',
          unterlagerId: unterlagerId ?? existing.unterlagerId ?? '',
          stueckProLiefergebinde: stueckProLiefergebinde ?? existing.stueckProLiefergebinde ?? 1,
          lieferantenArtnr: lieferantenArtnr ?? existing.lieferantenArtnr ?? '',
        })
      }
    }

    try {
      const pbToken = pb.authStore.token
      if (!pbToken || isTokenExpired(pbToken)) {
        return { ok: false, message: 'Sitzung abgelaufen — bitte erneut anmelden.' }
      }
      let lid = String(lagerId ?? '').trim()
      let ulid = String(unterlagerId ?? '').trim()
      const locOk = await normalizeArtikelLagerFields(pb, lid, ulid)
      if (!locOk.ok) return { ok: false, message: locOk.message }
      lid = locOk.lid
      ulid = locOk.ulid
      const plain = {
        artikelnummer: nrEff,
        ...(bc ? { barcode: bc } : {}),
        name: nm,
        preis: preisNum,
        einheit: ein,
        stueck_pro_liefergebinde: normalizeStueckProLiefergebinde(stueckProLiefergebinde ?? 1),
        lieferanten_artnr: String(lieferantenArtnr ?? '').trim().slice(0, 64),
        ...(catTrim ? { category: catTrim } : {}),
      }
      if (lid) plain.lager = lid
      if (ulid) plain.unterlager = ulid
      const tenantRes = await buildArtikelTenantIdPatch(pb, currentUser)
      if (!tenantRes.ok) return { ok: false, message: tenantRes.message }
      Object.assign(plain, tenantRes.patch)
      const body = artikelRecordBody(plain)
      if (!Number.isFinite(body.preis) || body.preis < 0) {
        return { ok: false, message: 'Preis fehlt im Request — bitte Zahl ≥ 0 eingeben und erneut speichern.' }
      }
      debugLogPbArtikelSave('create', PB_ARTICLES_COLLECTION, plain)
      const rec = await pbArtikelCreateJson(PB_ARTICLES_COLLECTION, body)
      const mapped = mapPbRecordToArticle(rec)
      if (!mapped) {
        return { ok: false, message: 'Antwort konnte nicht verarbeitet werden.' }
      }
      setItems((prev) => {
        const next = [...prev.filter((x) => x.id !== mapped.id), mapped]
        return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      })
      if (catTrim) handleAddCategory(catTrim)
      return { ok: true, id: mapped.id }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[handleCreateArtikel]', e?.status, e?.response ?? e)
      }
      const dup =
        pocketBaseMergedResponse(e).data?.artikelnummer ?? e?.data?.artikelnummer
      if (dup?.code === 'validation_not_unique' && nrEff) {
        return {
          ok: false,
          message: `Die Artikelnummer „${nrEff}“ ist bereits vergeben (evtl. archiviert, anderer Mandant oder nur in PocketBase sichtbar). Andere Nummer wählen oder Datensatz in PocketBase prüfen. Bei mehreren Mandanten: Migration 1777160000 anwenden (Unique je tenant_id + artikelnummer).`,
        }
      }
      const prErr = pocketBaseMergedResponse(e).data?.preis ?? e?.data?.preis
      if (prErr?.code === 'validation_required') {
        return {
          ok: false,
          message: `${pocketBaseFullErrorMessage(e)} — Wenn der Preis in der App gesetzt ist: In PocketBase dieselbe Instanz wie VITE_POCKETBASE_URL prüfen, Feld „preis“ (Typ Zahl), keine Hooks die den Preis leeren; im Netzwerk-Tab muss der JSON-Body \"preis\" als Zahl enthalten.`,
        }
      }
      const nrErr = pocketBaseMergedResponse(e).data?.artikelnummer ?? e?.data?.artikelnummer
      if (nrErr?.code === 'validation_required') {
        return {
          ok: false,
          message: `${pocketBaseFullErrorMessage(e)} — Die App sendet beim Anlegen immer eine Artikelnummer (Barcode → BC-…, sonst AUTO-…). PocketBase-Instanz, Collection-Feld „artikelnummer“ und ggf. Hooks prüfen.`,
        }
      }
      return { ok: false, message: pocketBaseFullErrorMessage(e) }
    }
  }

  const handleUpdateArtikel = async ({
    id,
    artikelnummer,
    name,
    preis,
    einheit,
    category,
    lagerId,
    unterlagerId,
    stueckProLiefergebinde,
    lieferantenArtnr,
  }) => {
    if (!userCan(currentUser, 'magazin:write') && !userCan(currentUser, 'inventur')) {
      return {
        ok: false,
        message:
          'Keine Berechtigung zum Speichern. PocketBase erlaubt Updates auf „artikel“ nur für Rollen Admin, Lagerleiter, Inventur oder „users“ — nicht für „Magazin nur lesen“.',
      }
    }
    const nr = String(artikelnummer ?? '').trim()
    const nm = String(name ?? '').trim()
    if (!id || !nr || !nm) {
      return { ok: false, message: 'Artikelnummer und Name sind Pflichtfelder.' }
    }
    const preisNum = coercePreisForPocketBase(preis)
    if (!Number.isFinite(preisNum) || preisNum < 0) {
      return { ok: false, message: 'Preis ungültig oder fehlt (Zahl ≥ 0).' }
    }
    const ein = String(einheit ?? '').trim() || 'Stk'
    const prevItem = items.find((x) => x.id === id)
    const stueckNorm =
      stueckProLiefergebinde !== undefined && stueckProLiefergebinde !== null
        ? normalizeStueckProLiefergebinde(stueckProLiefergebinde)
        : normalizeStueckProLiefergebinde(prevItem?.stueckProLiefergebinde ?? 1)
    const lieferantNr =
      lieferantenArtnr !== undefined
        ? String(lieferantenArtnr ?? '').trim().slice(0, 64)
        : String(prevItem?.lieferantenArtnr ?? '').trim().slice(0, 64)
    const lid =
      lagerId !== undefined && lagerId !== null
        ? String(lagerId).trim()
        : String(prevItem?.lagerId ?? '').trim()
    let uUlid =
      unterlagerId !== undefined && unterlagerId !== null
        ? String(unterlagerId).trim()
        : String(prevItem?.unterlagerId ?? '').trim()
    try {
      let lidNorm = String(lid ?? '').trim()
      const locOk = await normalizeArtikelLagerFields(pb, lidNorm, uUlid)
      if (!locOk.ok) return { ok: false, message: locOk.message }
      lidNorm = locOk.lid
      uUlid = locOk.ulid
      if (lidNorm) {
        try {
          await pb.collection(PB_COLLECTIONS.lager).getOne(lidNorm, { fields: 'id', requestKey: null })
        } catch {
          return {
            ok: false,
            message:
              'Zugeordnetes Lager existiert nicht oder ist nicht lesbar (API-Regeln „lager“). Bitte im Magazin/Lager eine gültige Zuordnung wählen oder eine Leitung kontaktieren.',
          }
        }
      }
      const tenantRes = await buildArtikelTenantIdPatch(pb, currentUser)
      if (!tenantRes.ok) return { ok: false, message: tenantRes.message }
      const plain = {
        artikelnummer: nr,
        name: nm,
        preis: preisNum,
        einheit: ein,
        category: String(category ?? '').trim(),
        stueck_pro_liefergebinde: stueckNorm,
        lieferanten_artnr: lieferantNr,
        lager: lidNorm || null,
        unterlager: uUlid || null,
        ...tenantRes.patch,
      }
      const bodyUp = artikelRecordBody(plain)
      if (!Number.isFinite(bodyUp.preis) || bodyUp.preis < 0) {
        return { ok: false, message: 'Preis fehlt im Request — bitte Zahl ≥ 0 eingeben und erneut speichern.' }
      }
      debugLogPbArtikelSave('update', PB_ARTICLES_COLLECTION, plain)
      const rec = await pbArtikelPatchJson(PB_ARTICLES_COLLECTION, id, bodyUp)
      const mapped = mapPbRecordToArticle(rec)
      if (!mapped) {
        return { ok: false, message: 'Antwort konnte nicht verarbeitet werden.' }
      }
      setItems((prev) => {
        const next = [...prev.filter((x) => x.id !== mapped.id), mapped]
        return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      })
      const cat = String(category ?? '').trim()
      if (cat) handleAddCategory(cat)
      return { ok: true, id: mapped.id }
    } catch (e) {
      const prErr = pocketBaseMergedResponse(e).data?.preis ?? e?.data?.preis
      if (prErr?.code === 'validation_required') {
        return {
          ok: false,
          message: `${pocketBaseFullErrorMessage(e)} — Siehe Hinweis unter „Artikel anlegen“ (preis / PocketBase / Netzwerk-Tab).`,
        }
      }
      return { ok: false, message: pocketBaseFullErrorMessage(e) }
    }
  }

  const handleBulkImportArtikel = async (parsedRows) => {
    const failed = []
    const skipped = []
    let created = 0
    let updated = 0
    const seenInFile = new Set()
    const idByNr = new Map()
    for (const it of items) {
      const k = String(it.artikelnummer ?? '').trim()
      if (k) idByNr.set(k, it.id)
    }

    for (const row of parsedRows) {
      const line = row.line ?? 0
      const nr = String(row.artikelnummer ?? '').trim()
      const nm = String(row.name ?? '').trim()

      if (!nm) {
        failed.push({ line, message: 'Name ist ein Pflichtfeld.' })
        continue
      }

      const preis = coercePreisForPocketBase(row.preis)
      if (!Number.isFinite(preis) || preis < 0) {
        failed.push({ line, message: 'Ungültiger Preis.' })
        continue
      }

      if (nr) {
        if (seenInFile.has(nr)) {
          skipped.push({ line, message: `Artikelnummer mehrfach in der Datei: ${nr}` })
          continue
        }
        const existingId = idByNr.get(nr)
        if (existingId) {
          const ok = window.confirm(
            `Die Artikelnummer „${nr}“ existiert bereits in der Datenbank.\n\nSoll der Artikel mit den Angaben aus Zeile ${line} aktualisiert werden (Name, Einheit, Preis, Kategorie)?`
          )
          if (!ok) {
            skipped.push({ line, message: 'Vorhandener Artikel: Aktualisierung abgelehnt.' })
            seenInFile.add(nr)
            continue
          }
          const existingRow = items.find((i) => i.id === existingId)
          const res = await handleUpdateArtikel({
            id: existingId,
            artikelnummer: nr,
            name: nm,
            preis,
            einheit: row.einheit,
            category: row.category,
            lagerId: existingRow?.lagerId ?? '',
            unterlagerId: existingRow?.unterlagerId ?? '',
            stueckProLiefergebinde: existingRow?.stueckProLiefergebinde ?? 1,
            lieferantenArtnr: existingRow?.lieferantenArtnr ?? '',
          })
          seenInFile.add(nr)
          if (res.ok) {
            updated += 1
          } else {
            failed.push({ line, message: res.message || 'Aktualisieren fehlgeschlagen.' })
          }
          continue
        }
        seenInFile.add(nr)
      }

      const res = await handleCreateArtikel({
        artikelnummer: nr,
        name: nm,
        preis,
        einheit: row.einheit,
        category: row.category,
      })

      if (res.ok) {
        created += 1
        if (nr && res.id) idByNr.set(nr, res.id)
      } else {
        const msg = res.message || 'Anlegen fehlgeschlagen.'
        if (/unique|already exists|artikelnummer|duplicate|doppelt/i.test(msg)) {
          skipped.push({ line, message: msg })
        } else {
          failed.push({ line, message: msg })
        }
      }
    }

    return { created, updated, failed, skipped }
  }

  const handleArchiveArtikel = async (id) => {
    const articleId = String(id ?? '').trim()
    if (!articleId) return { ok: false, message: 'Ungültige Artikel-ID.' }
    try {
      const tenantRes = await buildArtikelTenantIdPatch(pb, currentUser)
      if (!tenantRes.ok) return { ok: false, message: tenantRes.message }
      await pb.collection(PB_ARTICLES_COLLECTION).update(
        articleId,
        { archived: true, ...tenantRes.patch },
        { requestKey: null }
      )
      setItems((prev) => {
        const found = prev.find((x) => x.id === articleId)
        if (found) setArchivedItems((a) => [...a, { ...found, archived: true }])
        return prev.filter((x) => x.id !== articleId)
      })
      return { ok: true, id: articleId }
    } catch (e) {
      return { ok: false, message: pocketBaseFullErrorMessage(e) }
    }
  }

  const handleDeleteArtikel = async (id) => {
    const articleId = String(id ?? '').trim()
    if (!articleId) return { ok: false, message: 'Ungültige Artikel-ID.' }
    try {
      await pb.collection(PB_ARTICLES_COLLECTION).delete(articleId, { requestKey: null })
      setItems((prev) => prev.filter((x) => x.id !== articleId))
      return { ok: true, id: articleId }
    } catch (e) {
      return { ok: false, message: pocketBaseFullErrorMessage(e) }
    }
  }

  const handleViewChange = (newView) => {
    if (
      countingApp &&
      (newView === 'admin' || newView === 'lager' || newView === 'mitarbeiter')
    ) {
      setView('default')
      setMenuOpen(false)
      return
    }
    if (newView === 'admin' && !userCan(currentUser, 'magazin:read')) {
      setView('default')
      setMenuOpen(false)
      return
    }
    if (newView === 'lager' && !userCan(currentUser, 'magazin:read')) {
      setView('default')
      setMenuOpen(false)
      return
    }
    if (newView === 'mitarbeiter' && !userCan(currentUser, 'manageUsers')) {
      setView('default')
      setMenuOpen(false)
      return
    }
    if (newView === 'mail' && !userCan(currentUser, 'manageUsers')) {
      setView('default')
      setMenuOpen(false)
      return
    }
    if (newView === 'account' && !currentUser) {
      setMenuOpen(false)
      return
    }
    if (newView === 'default' && currentUser && !userCan(currentUser, 'inventur')) {
      if (!countingApp && userCan(currentUser, 'magazin:read')) {
        setView('admin')
      }
      setMenuOpen(false)
      return
    }
    setSettingsMenuOpen(false)
    setView(newView)
    setMenuOpen(false)
  }

  const handleLogout = () => {
    pb.authStore.clear()
    sessionStorage.removeItem(ZAEHL_SESSION_STORAGE_KEY)
    sessionStorage.removeItem(APP_VIEW_STORAGE_KEY)
    setCurrentUser(null)
    setZaehlSessionId(null)
    setZaehlScopeValue('')
    setZaehlScopeUnterlagers([])
    setMenuOpen(false)
    setSettingsMenuOpen(false)
    setView('default')
    setSelectedCategory('Alle')
    setSessionMessage('')
    setZaehlungSyncError('')
    setLoadError('')
  }

  const startZaehlSession = async () => {
    setSessionMessage('')
    setZaehlungSyncError('')
    setZaehlScopeValue('')
    setSessionBusy(true)
    try {
      if (!currentUser || !userCan(currentUser, 'inventur')) {
        setSessionMessage(
          'Keine Berechtigung zum Starten einer Zählsession (Rolle „Inventur“ oder höher nötig).'
        )
        return
      }
      const pbToken = pb.authStore.token
      if (!pbToken || isTokenExpired(pbToken)) {
        setSessionMessage(
          'Sitzung abgelaufen oder ungültig — bitte abmelden und erneut anmelden (ohne gültiges Token können keine Datensätze angelegt werden).'
        )
        return
      }
      const jwtId = String(getTokenPayload(pbToken)?.id ?? '').trim()
      const uid = String(
        jwtId || pb.authStore.model?.id || currentUser?.id || ''
      ).trim()
      if (!uid) {
        setSessionMessage('Nicht angemeldet oder Nutzer-ID fehlt — bitte neu anmelden.')
        return
      }
      if (
        import.meta.env.DEV &&
        currentUser?.id &&
        jwtId &&
        String(currentUser.id) !== jwtId
      ) {
        console.warn('[startZaehlSession] currentUser.id weicht von JWT id ab — nutze JWT.', {
          currentUserId: currentUser.id,
          jwtId,
        })
      }
      /* PocketBase date: wie bestehende Zeilen (Leerzeichen statt „T“, Zulu-Z). */
      const started = new Date().toISOString().replace('T', ' ')
      const payload = {
        started,
        session_owner: uid,
      }
      const tenantId = String(currentUser?.tenantId ?? '').trim()
      if (tenantId) {
        try {
          await pb.collection(PB_COLLECTIONS.standorte).getOne(tenantId, { requestKey: null })
          payload.tenant_id = tenantId
        } catch {
          if (import.meta.env.DEV) {
            console.warn(
              '[startZaehlSession] tenant_id nicht lesbar oder ungültig — Session ohne Mandant:',
              tenantId
            )
          }
        }
      }
      /* Ohne Unterlager-Relation = mandantenweite Zählung („alle Lager“). */
      /* requestKey: null = keine SDK-Auto-Cancellation (vermeidet abgebrochene POSTs). */
      const rec = await pb.collection(PB_COLLECTIONS.zaehlSessions).create(payload, {
        requestKey: null,
      })
      const id = rec.id
      sessionStorage.setItem(ZAEHL_SESSION_STORAGE_KEY, id)
      setZaehlSessionId(id)
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('session', id)
        window.history.replaceState({}, '', url)
      } catch {
        /* ignore */
      }
    } catch (e) {
      const msg = pocketBaseFullErrorMessage(
        e,
        'Bitte API-Rule und Felder der Collection `zaehl_sessions` prüfen (v. a. `createRule`, `tenant_id`, `unterlager`).'
      )
      if (import.meta.env.DEV) {
        const r = e?.response
        console.error('[startZaehlSession]', e, r ? JSON.stringify(r) : '')
      }
      setSessionMessage(msg)
    } finally {
      setSessionBusy(false)
    }
  }

  const openBackendCommandPaletteRef = useRef(() => {})
  openBackendCommandPaletteRef.current = () => {
    if (!currentUser || !userCan(currentUser, 'magazin:read')) return
    if (view !== 'admin') {
      handleViewChange('admin')
      requestAnimationFrame(() =>
        window.dispatchEvent(new CustomEvent('vibe-magazin-open-command'))
      )
    } else {
      window.dispatchEvent(new CustomEvent('vibe-magazin-open-command'))
    }
  }

  useEffect(() => {
    if (countingApp || !currentUser || !userCan(currentUser, 'magazin:read')) return
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openBackendCommandPaletteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [countingApp, currentUser])

  const handleZaehlScopeChange = (nextScope) => {
    setZaehlScopeValue(nextScope)
  }

  const stopBarcodeCamera = () => {
    if (barcodeZxingControlsRef.current) {
      try {
        barcodeZxingControlsRef.current.stop()
      } catch {
        /* ignore */
      }
      barcodeZxingControlsRef.current = null
    }
    if (barcodeRafRef.current) {
      cancelAnimationFrame(barcodeRafRef.current)
      barcodeRafRef.current = 0
    }
    const s = barcodeStreamRef.current
    if (s) {
      s.getTracks().forEach((t) => t.stop())
      barcodeStreamRef.current = null
    }
    const v = barcodeVideoRef.current
    if (v) v.srcObject = null
    barcodeScanLockRef.current = false
    setBarcodeScannerActive(false)
  }

  const resolveScannedBarcode = useCallback((scannedCode) => {
    const code = String(scannedCode ?? barcodeInput ?? '').trim()
    if (!code) return
    const hit = items.find((it) => barcodesMatch(it.barcode, code))
    if (hit) {
      const searchLikeManual =
        String(hit.name ?? '').trim() ||
        String(hit.artikelnummer ?? '').trim() ||
        code
      flushSync(() => {
        stopBarcodeCamera()
        setBarcodeDialogOpen(false)
        setBarcodeInput('')
        setBarcodeLookupName('')
        setBarcodeLookupMessage('')
        setBarcodeScannerMessage('')
        setBarcodeLinkMode('create')
        setBarcodeLinkSearch('')
        setBarcodeLinkSelectedId(null)
        setSelectedCategory('Alle')
        setArtikelSearchQuery(searchLikeManual)
        setBarcodeScrollArticleId(hit.id)
      })
      return
    }
    setBarcodeInput(code)
    setBarcodeLinkMode('create')
    setBarcodeLinkSearch('')
    setBarcodeLinkSelectedId(null)
    setBarcodeLookupBusy(true)
    setBarcodeLookupMessage('')
    void fetchOpenFoodFactsName(code)
      .then((name) => {
        setBarcodeLookupName(name)
        setBarcodeLookupMessage(
          name
            ? 'Kein Artikel in deinem Bestand. Name aus Open Food Facts wurde übernommen.'
            : 'Kein Artikel im Bestand gefunden. API liefert keinen Namen.'
        )
      })
      .finally(() => {
        setBarcodeLookupBusy(false)
      })
  }, [barcodeInput, items])

  /** Hintergrund fixieren: verhindert Scroll-/Focus-Sprünge der Artikel-Liste, wenn der Barcode-Dialog offen ist. */
  useEffect(() => {
    if (!barcodeDialogOpen) return
    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.left = prev.bodyLeft
      body.style.right = prev.bodyRight
      body.style.width = prev.bodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [barcodeDialogOpen])

  useLayoutEffect(() => {
    if (!barcodeDialogOpen) return
    const id = requestAnimationFrame(() => {
      barcodeDialogInputRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [barcodeDialogOpen])

  useEffect(() => {
    if (!barcodeDialogOpen) {
      stopBarcodeCamera()
      setBarcodeScannerMessage('')
      return
    }
    if (!window.isSecureContext) {
      setBarcodeScannerMessage(
        'Live-Kamera: Bei http:// im WLAN nicht möglich (Vorgabe des Browsers). ' +
          'Stattdessen Barcode tippen, oder lokal HTTPS (certs/, siehe Server-Konsole).'
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeScannerMessage('Kein Kamera-Zugriff verfügbar.')
      return
    }

    let cancelled = false
    let nativeDetector = null
    if (typeof window.BarcodeDetector === 'function') {
      try {
        nativeDetector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        })
      } catch {
        nativeDetector = null
      }
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        barcodeStreamRef.current = stream
        const video = barcodeVideoRef.current
        if (!video) return

        if (nativeDetector) {
          video.srcObject = stream
          await video.play()
          setBarcodeScannerActive(true)
          setBarcodeScannerMessage('Kamera aktiv. Barcode ins Bild halten.')

          const tick = async () => {
            if (cancelled) return
            try {
              if (video.readyState >= 2 && !barcodeScanLockRef.current) {
                const codes = await nativeDetector.detect(video)
                const raw = String(codes?.[0]?.rawValue ?? '').trim()
                if (raw) {
                  barcodeScanLockRef.current = true
                  stopBarcodeCamera()
                  resolveScannedBarcode(raw)
                  return
                }
              }
            } catch {
              /* ignore frame errors */
            }
            barcodeRafRef.current = requestAnimationFrame(tick)
          }
          barcodeRafRef.current = requestAnimationFrame(tick)
          return
        }

        /* Safari u. a.: kein BarcodeDetector → Live-Scan mit ZXing */
        setBarcodeScannerMessage('Kamera aktiv (Kompatibilitätsmodus). Barcode ins Bild halten.')
        setBarcodeScannerActive(true)
        const reader = new BrowserMultiFormatReader()
        let controls
        try {
          controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
            if (cancelled || barcodeScanLockRef.current) return
            const raw = result ? String(result.getText?.() ?? '').trim() : ''
            if (!raw) return
            barcodeScanLockRef.current = true
            try {
              ctrl.stop()
            } catch {
              /* ignore */
            }
            barcodeZxingControlsRef.current = null
            stopBarcodeCamera()
            resolveScannedBarcode(raw)
          })
        } catch (e) {
          stream.getTracks().forEach((t) => t.stop())
          barcodeStreamRef.current = null
          setBarcodeScannerActive(false)
          setBarcodeScannerMessage('Kamera-Scan konnte nicht gestartet werden.')
          if (import.meta.env.DEV) console.error('[barcode zxing]', e)
          return
        }
        if (cancelled) {
          try {
            controls.stop()
          } catch {
            /* ignore */
          }
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        barcodeZxingControlsRef.current = controls
      } catch {
        setBarcodeScannerMessage('Kamera konnte nicht gestartet werden (Berechtigung prüfen).')
      }
    }

    void start()
    return () => {
      cancelled = true
      stopBarcodeCamera()
    }
  }, [barcodeDialogOpen, resolveScannedBarcode])

  const closeBarcodeDialog = () => {
    setBarcodeDialogOpen(false)
    stopBarcodeCamera()
    setBarcodeLinkMode('create')
    setBarcodeLinkSearch('')
    setBarcodeLinkSelectedId(null)
    setBarcodeScrollArticleId(null)
  }

  const confirmAddBarcodeArtikel = async () => {
    const code = String(barcodeInput ?? '').trim()
    const name = String(barcodeLookupName ?? '').trim()
    const preis = parsePreisInput(barcodeCreateDraft.preisInput)
    const einheit = String(barcodeCreateDraft.einheit ?? '').trim() || 'Stk'
    const category = String(barcodeCreateDraft.category ?? '').trim()
    if (!code) return
    if (!name) {
      setBarcodeLookupMessage('Bitte Artikelname ergänzen.')
      return
    }
    if (!Number.isFinite(preis) || preis < 0) {
      setBarcodeLookupMessage('Bitte einen gültigen Preis eingeben.')
      return
    }
    const ok = window.confirm(`Neuen Artikel „${name}“ mit Barcode ${code} anlegen?`)
    if (!ok) return
    const res = await handleCreateArtikel({
      artikelnummer: '',
      barcode: code,
      name,
      preis,
      einheit,
      category,
      lagerId: '',
      unterlagerId: '',
    })
    if (res.ok) {
      setBarcodeDialogOpen(false)
      setBarcodeInput('')
      setBarcodeLookupName('')
      setBarcodeLookupMessage('')
      setBarcodeCreateDraft({ preisInput: '', einheit: 'Stk', category: '' })
      setBarcodeLinkMode('create')
      setBarcodeLinkSearch('')
      setBarcodeLinkSelectedId(null)
      setSessionMessage(`Artikel „${name}“ wurde angelegt.`)
    } else {
      setBarcodeLookupMessage(res.message || 'Artikel konnte nicht angelegt werden.')
    }
  }

  const confirmLinkBarcodeToArtikel = async () => {
    const code = String(barcodeInput ?? '').trim()
    if (!code) return
    const selId = barcodeLinkSelectedId
    if (!selId) {
      setBarcodeLookupMessage('Bitte einen Artikel aus der Liste auswählen.')
      return
    }
    const art = items.find((x) => x.id === selId)
    if (!art) {
      setBarcodeLookupMessage('Auswahl ungültig. Bitte erneut wählen.')
      return
    }
    const prevBc = String(art.barcode ?? '').trim()
    const confirmText = prevBc
      ? `Barcode ${code} dem Artikel „${art.name}“ zuordnen?\n\nDer bisherige Barcode „${prevBc}“ wird überschrieben.`
      : `Barcode ${code} dem Artikel „${art.name}“ zuordnen?`
    if (!window.confirm(confirmText)) return
    try {
      const tenantRes = await buildArtikelTenantIdPatch(pb, currentUser)
      if (!tenantRes.ok) {
        setBarcodeLookupMessage(tenantRes.message)
        return
      }
      const rec = await pb.collection(PB_ARTICLES_COLLECTION).update(
        selId,
        { barcode: code, ...tenantRes.patch },
        { requestKey: null }
      )
      const mapped = mapPbRecordToArticle(rec)
      if (!mapped) {
        setBarcodeLookupMessage('Antwort konnte nicht verarbeitet werden.')
        return
      }
      setItems((prev) => {
        const next = [...prev.filter((x) => x.id !== mapped.id), mapped]
        return next.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      })
      setBarcodeDialogOpen(false)
      setBarcodeInput('')
      setBarcodeLookupName('')
      setBarcodeLookupMessage('')
      setBarcodeCreateDraft({ preisInput: '', einheit: 'Stk', category: '' })
      setBarcodeLinkMode('create')
      setBarcodeLinkSearch('')
      setBarcodeLinkSelectedId(null)
      setSessionMessage(`Barcode wurde „${art.name}“ zugeordnet.`)
    } catch (e) {
      setBarcodeLookupMessage(
        pocketBaseFullErrorMessage(e, 'PocketBase: Update-Regel für `artikel` prüfen.')
      )
    }
  }

  const runFinalizeZaehlSessionClose = useCallback(
    async (
      sessionId,
      {
        getPositionenForClose = null,
        skipUiMerge = true,
        clearLocalSession = false,
      } = {}
    ) => {
      if (!sessionId) return { ok: false, message: 'Keine Session-ID.' }
      let positionen = []
      try {
        positionen = await resolvePositionenForSessionEnd(
          pb,
          sessionId,
          items,
          getPositionenForClose,
          { skipUiMerge: skipUiMerge }
        )
      } catch {
        positionen = []
      }
      positionen = positionen.filter((r) => Number(r?.gezaehlte_menge) > 0)
      const endedIso = new Date().toISOString()
      try {
        await pb.collection(PB_COLLECTIONS.zaehlSessions).update(sessionId, {
          ended: endedIso,
          positionen,
        })
      } catch (e) {
        const msg =
          e?.response?.message ||
          e?.message ||
          'Session konnte nicht beendet werden. Liegt in PocketBase das JSON-Feld „positionen“ in zaehl_sessions? (Migration ausführen oder manuell anlegen.)'
        setSessionMessage(msg)
        return { ok: false, message: msg }
      }
      const archiv = await archiveCountedPositionsToInventurArchiv(
        pb,
        sessionId,
        endedIso,
        positionen
      )
      if (!archiv.ok && archiv.errors.length) {
        setSessionMessage(
          `Inventur ist gespeichert, Archiv-Eintrag fehlgeschlagen: ${archiv.errors[0]}`
        )
      }
      try {
        await deleteZaehlungPositionsForSession(pb, sessionId)
      } catch (e) {
        const msg =
          e?.response?.message ||
          e?.message ||
          'Session ist beendet, aber Zählpositionen konnten nicht gelöscht werden.'
        setSessionMessage(msg)
      }
      if (clearLocalSession) {
        sessionStorage.removeItem(ZAEHL_SESSION_STORAGE_KEY)
        setZaehlSessionId(null)
        setZaehlScopeValue('')
        setZaehlScopeUnterlagers([])
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('session')
          url.searchParams.delete('zaehlSession')
          window.history.replaceState({}, '', url)
        } catch {
          /* ignore */
        }
      }
      setLastInventurRefresh((n) => n + 1)
      return { ok: true }
    },
    [items]
  )

  const endZaehlSession = async () => {
    if (!zaehlSessionId) return
    if (!canEndActiveZaehlSession) {
      setSessionMessage(
        'Nur die Session-Besitzerin bzw. der Session-Besitzer oder ein Administrator kann die Zählung beenden.'
      )
      return
    }
    setSessionMessage('')
    setZaehlungSyncError('')
    setSessionBusy(true)
    try {
      await runFinalizeZaehlSessionClose(zaehlSessionId, {
        getPositionenForClose: articleInventoryRef.current?.getPositionenForClose,
        skipUiMerge: countingApp,
        clearLocalSession: true,
      })
    } finally {
      setSessionBusy(false)
    }
  }

  const joinZaehlSession = useCallback(async (id) => {
    const sid = String(id ?? '').trim()
    setSessionMessage('')
    if (!sid) return
    try {
      const rec = await pb.collection(PB_COLLECTIONS.zaehlSessions).getOne(sid, { requestKey: null })
      if (rec.ended) {
        setSessionMessage('Diese Session ist bereits beendet.')
        return
      }
      sessionStorage.setItem(ZAEHL_SESSION_STORAGE_KEY, sid)
      setZaehlSessionId(sid)
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('session', sid)
        window.history.replaceState({}, '', url)
      } catch {
        /* ignore */
      }
    } catch (e) {
      setSessionMessage(
        pocketBaseFullErrorMessage(e, 'Session konnte nicht geöffnet werden. Berechtigung oder ID prüfen.')
      )
    }
  }, [])

  const endOpenZaehlSessionFromBackend = useCallback(
    async (sessionId) => {
      const sid = String(sessionId ?? '').trim()
      if (!sid || !currentUser) return { ok: false, message: 'Ungültige Anfrage.' }
      try {
        const rec = await pb.collection(PB_COLLECTIONS.zaehlSessions).getOne(sid, {
          expand: 'session_owner',
          requestKey: null,
        })
        if (rec.ended) return { ok: false, message: 'Diese Session ist bereits beendet.' }
        if (!userCanEndZaehlSession(currentUser, rec)) {
          return {
            ok: false,
            message:
              'Nur die Session-Besitzerin bzw. der Session-Besitzer oder ein Administrator kann beenden.',
          }
        }
      } catch (e) {
        return {
          ok: false,
          message: pocketBaseFullErrorMessage(e, 'Session konnte nicht geladen werden.'),
        }
      }
      const isActive = sid === zaehlSessionId
      return runFinalizeZaehlSessionClose(sid, {
        getPositionenForClose: isActive ? articleInventoryRef.current?.getPositionenForClose : null,
        skipUiMerge: countingApp ? isActive : true,
        clearLocalSession: isActive,
      })
    },
    [currentUser, zaehlSessionId, countingApp, runFinalizeZaehlSessionClose]
  )

  return (
    <>
      <Toaster closeButton position="top-center" />
      {authReady && !currentUser ? <LoginView /> : null}

      {/* Mobile: Hamburger + Side-Menü */}
      {authReady && currentUser && (
        <button 
          className="hamburger-menu"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menü öffnen"
        >
          <span className={`hamburger-icon-wrap ${menuOpen ? 'open' : ''}`} aria-hidden="true">
            <Menu className="hamburger-icon hamburger-icon-menu" size={20} strokeWidth={2.25} />
            <X className="hamburger-icon hamburger-icon-close" size={20} strokeWidth={2.25} />
          </span>
        </button>
      )}
      
      {authReady && currentUser && menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)}></div>
      )}
      
      {authReady && currentUser && (
        <nav className={`side-menu ${menuOpen ? 'open' : ''}`} aria-label="Hauptnavigation">
          {!countingApp ? (
            <div className="side-menu-brand" aria-hidden={false}>
              <span className="side-menu-brand-mark">
                {tenantStandort?.logo ? (
                  <img
                    src={pb.files.getURL(
                      tenantStandort,
                      Array.isArray(tenantStandort.logo) ? tenantStandort.logo[0] : tenantStandort.logo,
                    )}
                    alt=""
                    className="side-menu-brand-logo"
                  />
                ) : (
                  'i'
                )}
              </span>
              <span className="side-menu-brand-text">Inventur</span>
            </div>
          ) : null}
          <div className="side-menu-nav">
            {currentUser && userCan(currentUser, 'inventur') ? (
              <button
                type="button"
                onClick={() => handleViewChange('default')}
                className={view === 'default' ? 'active' : ''}
              >
                Inventuren
              </button>
            ) : null}
            {!countingApp && currentUser && userCan(currentUser, 'magazin:read') ? (
              <button
                type="button"
                onClick={() => handleViewChange('lager')}
                className={view === 'lager' ? 'active' : ''}
              >
                Lagerverwaltung
              </button>
            ) : null}
            {!countingApp && currentUser && userCan(currentUser, 'magazin:read') ? (
              <button
                type="button"
                onClick={() => handleViewChange('admin')}
                className={view === 'admin' ? 'active' : ''}
              >
                Magazin
              </button>
            ) : null}
            {!countingApp && currentUser && userCan(currentUser, 'manageUsers') ? (
              <button
                type="button"
                onClick={() => handleViewChange('mitarbeiter')}
                className={view === 'mitarbeiter' ? 'active' : ''}
              >
                Mitarbeiter
              </button>
            ) : null}
          </div>
          <div className="side-menu-end">
            {!countingApp && currentUser && userCan(currentUser, 'magazin:read') ? (
              <button
                type="button"
                className="magazin-cmdk-trigger"
                onClick={() => openBackendCommandPaletteRef.current()}
                aria-label="Suche und Aktionen öffnen"
              >
                <Search className="magazin-cmdk-trigger-icon" size={13} strokeWidth={2} aria-hidden />
                <span className="magazin-cmdk-trigger-label">Suche &amp; Aktionen</span>
                <span className="magazin-cmdk-trigger-kbd" aria-hidden>
                  <kbd className="magazin-cmdk-kbd">⌘</kbd>
                  <kbd className="magazin-cmdk-kbd">K</kbd>
                </span>
              </button>
            ) : null}
            <div className="side-menu-settings-wrap" ref={settingsMenuRef}>
            <button
              type="button"
              className="side-menu-settings-trigger"
              aria-label="Einstellungen"
              aria-expanded={settingsMenuOpen}
              aria-haspopup="menu"
              aria-controls="side-menu-settings-menu"
              id="side-menu-settings-button"
              onClick={() => setSettingsMenuOpen((o) => !o)}
            >
              {currentUser.profileImageThumbUrl ? (
                <img
                  src={currentUser.profileImageThumbUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="side-menu-settings-avatar"
                />
              ) : (
                <span className="side-menu-settings-avatar-initials" aria-hidden="true">
                  {avatarInitials(currentUser.firstName, currentUser.lastName, currentUser.email)}
                </span>
              )}
            </button>
            {settingsMenuOpen ? (
              <div
                className="side-menu-settings-dropdown"
                id="side-menu-settings-menu"
                role="menu"
                aria-labelledby="side-menu-settings-button"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={view === 'account' ? 'active' : ''}
                  onClick={() => handleViewChange('account')}
                >
                  Account
                </button>
                {currentUser && userCan(currentUser, 'manageUsers') ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={view === 'mail' ? 'active' : ''}
                    onClick={() => handleViewChange('mail')}
                  >
                    E-Mail (SMTP)
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setSettingsMenuOpen(false)
                    handleLogout()
                  }}
                >
                  Logout
                </button>
              </div>
            ) : null}
            </div>
          </div>
        </nav>
      )}

      {authReady && currentUser && (
        <div className="header-container">
          <span className="header-top-spacer" aria-hidden="true" />
          <header className="app-header" aria-label="Kopfzeile" />
          {view === 'default' && zaehlSessionId && countingEntryUi ? (
            <div className="inventur-header-toolbar">
              <div className="inventur-header-zaehl-scope">
                <select
                  id="session-zaehl-lager-select"
                  className="inventur-header-zaehl-select"
                  value={
                    zaehlScopeValue.startsWith('u:') ? zaehlScopeValue : ''
                  }
                  onChange={(e) => handleZaehlScopeChange(e.target.value)}
                  aria-label="Unterlager wählen oder alle Lager"
                >
                  <option value="">Alle Lager</option>
                  {zaehlScopeUnterlagers.map((u) => (
                    <option key={u.id} value={`u:${u.id}`}>
                      {formatUnterlagerNameOnly(u) || formatUnterlagerLabel(u)}
                    </option>
                  ))}
                  {zaehlScopeValue.startsWith('u:') &&
                  !zaehlScopeUnterlagers.some((u) => `u:${u.id}` === zaehlScopeValue) ? (
                    <option value={zaehlScopeValue}>{zaehlScopeValue}</option>
                  ) : null}
                </select>
              </div>
              <div className="inventur-header-actions">
                <input
                  type="text"
                  className="inventur-header-search"
                  value={artikelSearchQuery}
                  onChange={(e) => setArtikelSearchQuery(e.target.value)}
                  placeholder="Artikel suchen (Name/Nr./Barcode)"
                  aria-label="Artikel suchen"
                />
                <button
                  type="button"
                  className="inventur-header-scan-btn"
                  onClick={() => {
                    setBarcodeDialogOpen(true)
                    setBarcodeLookupMessage('')
                    setBarcodeScannerMessage('')
                  }}
                  aria-label="Barcode scannen"
                >
                  <svg
                    className="inventur-header-scan-icon"
                    viewBox="0 0 64 64"
                    aria-hidden="true"
                  >
                    <path d="M8 20V10h10M56 20V10H46M8 44v10h10M56 44v10H46" />
                    <path d="M16 18v28M21 18v28M26 18v28M31 18v28M35 18v28M40 18v28M45 18v28M50 18v28" />
                    <path d="M14 32h36" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
          {view === 'default' && zaehlSessionId && countingEntryUi ? (
            <div className="inventur-categories" ref={categoryNavRef}>
              {['Alle', ...categories].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`inventur-category-tab ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
              <span className="inventur-categories-spacer" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      )}

      <main
        className={
          authReady && currentUser
            ? `with-header${view === 'default' && countingEntryUi ? ' main-with-zaehl-bar' : ''}${
                view === 'default' && zaehlSessionId && countingEntryUi ? ' main-with-inventur-session' : ''
              }${
                view === 'default' && countingEntryUi && zaehlSessionId
                  ? ' main-with-header-lager-scope'
                  : ''
              }`
            : ''
        }
      >
        {authReady && currentUser && view === 'lager' && userCan(currentUser, 'magazin:read') ? (
          <LagerverwaltungPage
            readOnly={!userCan(currentUser, 'magazin:write')}
            canAssignUsers={userCan(currentUser, 'manageUsers')}
          />
        ) : null}

        {authReady && currentUser && view === 'admin' && userCan(currentUser, 'magazin:read') && (
          <MagazinPage
            categories={categories}
            items={items}
            archivedItems={archivedItems}
            loadError={loadError}
            readOnlyMagazin={!userCan(currentUser, 'magazin:write')}
            currentUser={currentUser}
            onAddCategory={handleAddCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onCreateArtikel={handleCreateArtikel}
            onBulkImportArtikel={handleBulkImportArtikel}
            onUpdateArtikel={handleUpdateArtikel}
            onArchiveArtikel={handleArchiveArtikel}
            onDeleteArtikel={handleDeleteArtikel}
          />
        )}

        {authReady && currentUser && view === 'mitarbeiter' && userCan(currentUser, 'manageUsers') ? (
          <MitarbeiterView />
        ) : null}

        {authReady && currentUser && view === 'account' ? <AccountSettingsPage user={currentUser} /> : null}

        {authReady && currentUser && view === 'mail' && userCan(currentUser, 'manageUsers') ? (
          <MailSmtpSettingsPage />
        ) : null}

        {authReady && currentUser && view === 'default' && userCan(currentUser, 'inventur') && (
          <>
            {loadError ? <p className="user-mgmt-error">{loadError}</p> : null}
            {zaehlSessionId && countingEntryUi ? (
              <ArticleView
                ref={articleInventoryRef}
                key={`${zaehlSessionId}:${zaehlScopeValue || 'all'}`}
                items={items}
                selectedCategory={selectedCategory}
                searchQuery={artikelSearchQuery}
                activeZaehlSessionId={zaehlSessionId}
                onSyncError={setZaehlungSyncError}
                countingApp={countingApp}
                zaehlScopeKey={effectiveZaehlScope}
                scrollFocusArticleId={barcodeScrollArticleId}
                onScrollFocusArticleIdHandled={() => setBarcodeScrollArticleId(null)}
              />
            ) : (
              <>
                {countingEntryUi ? (
                  <InventurDashboard
                    refreshTrigger={lastInventurRefresh}
                    catalogArticleCount={items.length}
                    onJoinOpenSession={joinZaehlSession}
                    currentUser={currentUser}
                  />
                ) : null}
                {!countingEntryUi ? (
                  <LastInventurView
                    refreshTrigger={lastInventurRefresh}
                    currentUser={currentUser}
                    onEndOpenSession={endOpenZaehlSessionFromBackend}
                    onNeueInventur={startZaehlSession}
                    neueInventurBusy={sessionBusy}
                  />
                ) : null}
              </>
            )}
            {zaehlSessionId && countingEntryUi && zaehlungSyncError ? (
              <p className="session-message" role="alert">
                {zaehlungSyncError}
              </p>
            ) : null}
            {sessionMessage && !countingEntryUi ? (
              <p className="session-message" role="alert">
                {sessionMessage}
              </p>
            ) : null}
          </>
        )}

        {authReady && currentUser && view === 'default' && !userCan(currentUser, 'inventur') ? (
          <div className="admin-view">
            <p className="session-message session-message--info" role="status">
              Für dein Konto ist die Inventur-Ansicht nicht freigeschaltet.
            </p>
          </div>
        ) : null}

      </main>

      {authReady &&
      currentUser &&
      countingEntryUi &&
      view === 'default' &&
      userCan(currentUser, 'inventur') ? (
        <div className="session-count-bar" role="toolbar" aria-label="Zählsession">
          <div className="session-count-bar-inner">
            {sessionMessage ? (
              <p className="session-count-bar-message" role="alert">
                {sessionMessage}
              </p>
            ) : null}
            {!zaehlSessionId ? (
              <button
                type="button"
                className="session-count-btn session-count-start"
                disabled={sessionBusy}
                onClick={startZaehlSession}
              >
                {sessionBusy ? '…' : 'Start'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="session-count-btn session-count-end"
                  disabled={sessionBusy || !canEndActiveZaehlSession}
                  title={
                    canEndActiveZaehlSession
                      ? undefined
                      : 'Nur Besitzer oder Administrator kann die Session beenden.'
                  }
                  onClick={endZaehlSession}
                >
                  {sessionBusy ? '…' : 'Fertig'}
                </button>
                {!canEndActiveZaehlSession ? (
                  <p className="session-count-bar-hint" role="note">
                    Beenden nur durch Besitzer oder Admin.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      {barcodeDialogOpen ? (
        <div className="barcode-dialog-backdrop" role="presentation" onClick={closeBarcodeDialog}>
          <div
            className="barcode-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Barcode erfassen"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="barcode-dialog-title">Barcode erfassen</h3>
            <p className="barcode-dialog-hint">
              Barcode eingeben oder live scannen. Treffer nur über das Feld{' '}
              <code>barcode</code>.
            </p>
            <div className="barcode-camera-wrap">
              <video ref={barcodeVideoRef} className="barcode-camera-video" muted playsInline />
              {!barcodeScannerActive ? (
                <div className="barcode-camera-overlay">
                  {barcodeScannerMessage || 'Kamera wird vorbereitet…'}
                </div>
              ) : null}
            </div>
            {barcodeScannerMessage ? <p className="barcode-dialog-status">{barcodeScannerMessage}</p> : null}
            <input
              ref={barcodeDialogInputRef}
              type="text"
              inputMode="numeric"
              className="barcode-dialog-input"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Barcode eingeben"
              aria-label="Barcode eingeben"
            />
            <div className="barcode-dialog-actions">
              <button type="button" className="admin-btn-row" onClick={closeBarcodeDialog}>
                Schließen
              </button>
              <button type="button" className="admin-btn-row admin-btn-row--save" onClick={resolveScannedBarcode}>
                {barcodeLookupBusy ? 'Prüfe …' : 'Prüfen'}
              </button>
            </div>
            {String(barcodeInput).trim() ? (
              <div className="barcode-dialog-missing">
                <p>Kein Artikel mit Barcode <strong>{barcodeInput.trim()}</strong> gefunden.</p>
                <div className="barcode-dialog-mode-tabs" role="tablist" aria-label="Vorgehen bei unbekanntem Barcode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={barcodeLinkMode === 'create'}
                    className={`barcode-dialog-mode-tab${barcodeLinkMode === 'create' ? ' barcode-dialog-mode-tab--active' : ''}`}
                    onClick={() => {
                      setBarcodeLinkMode('create')
                      setBarcodeLinkSelectedId(null)
                    }}
                  >
                    Neu anlegen
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={barcodeLinkMode === 'pick'}
                    className={`barcode-dialog-mode-tab${barcodeLinkMode === 'pick' ? ' barcode-dialog-mode-tab--active' : ''}`}
                    onClick={() => setBarcodeLinkMode('pick')}
                  >
                    Bestehend verknüpfen
                  </button>
                </div>
                {barcodeLinkMode === 'create' ? (
                  <>
                    <p>Neuen Artikel anlegen (Artikelnummer bleibt leer):</p>
                    <input
                      type="text"
                      className="barcode-dialog-input"
                      value={barcodeLookupName}
                      onChange={(e) => setBarcodeLookupName(e.target.value)}
                      placeholder="Artikelname"
                      aria-label="Artikelname"
                    />
                    <div className="barcode-dialog-create-grid">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="barcode-dialog-input"
                        value={barcodeCreateDraft.preisInput}
                        onChange={(e) =>
                          setBarcodeCreateDraft((prev) => ({ ...prev, preisInput: e.target.value }))
                        }
                        placeholder="Preis (z. B. 1,99)"
                        aria-label="Preis"
                      />
                      <select
                        className="barcode-dialog-input"
                        value={barcodeCreateDraft.einheit}
                        onChange={(e) =>
                          setBarcodeCreateDraft((prev) => ({ ...prev, einheit: e.target.value }))
                        }
                        aria-label="Einheit"
                      >
                        <option value="Stk">Stk</option>
                        <option value="l">l</option>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="Kiste">Kiste</option>
                      </select>
                      <select
                        className="barcode-dialog-input"
                        value={barcodeCreateDraft.category}
                        onChange={(e) =>
                          setBarcodeCreateDraft((prev) => ({ ...prev, category: e.target.value }))
                        }
                        aria-label="Kategorie"
                      >
                        <option value="">— Keine —</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="barcode-dialog-actions">
                      <button
                        type="button"
                        className="admin-btn-row admin-btn-row--save"
                        onClick={() => void confirmAddBarcodeArtikel()}
                      >
                        Artikel anlegen
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="barcode-dialog-hint barcode-dialog-hint--tight">
                      Barcode <strong>{barcodeInput.trim()}</strong> einem Artikel aus deinem Bestand zuordnen
                      (Feld <code>barcode</code> wird gesetzt).
                    </p>
                    <input
                      type="search"
                      className="barcode-dialog-input"
                      value={barcodeLinkSearch}
                      onChange={(e) => setBarcodeLinkSearch(e.target.value)}
                      placeholder="Suche: Name, Artikelnr., Kategorie …"
                      aria-label="Artikel suchen"
                      autoComplete="off"
                    />
                    <ul className="barcode-dialog-link-list" role="listbox" aria-label="Artikel wählen">
                      {barcodeLinkCandidates.length === 0 ? (
                        <li className="barcode-dialog-link-empty">Keine Treffer.</li>
                      ) : (
                        barcodeLinkCandidates.map((it) => {
                          const selected = barcodeLinkSelectedId === it.id
                          return (
                            <li key={it.id} role="none">
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`barcode-dialog-link-item${selected ? ' barcode-dialog-link-item--selected' : ''}`}
                                onClick={() => setBarcodeLinkSelectedId(it.id)}
                              >
                                <span className="barcode-dialog-link-item-title">{it.name || '—'}</span>
                                <span className="barcode-dialog-link-item-meta">
                                  {it.artikelnummer ? `Nr. ${it.artikelnummer}` : 'Ohne Artikelnr.'}
                                  {it.category ? ` · ${it.category}` : ''}
                                  {String(it.barcode ?? '').trim()
                                    ? ` · bisher: ${String(it.barcode).trim()}`
                                    : ''}
                                </span>
                              </button>
                            </li>
                          )
                        })
                      )}
                    </ul>
                    {barcodeLinkSelectedId ? (
                      <p className="barcode-dialog-link-preview">
                        Auswahl:{' '}
                        <strong>
                          {items.find((x) => x.id === barcodeLinkSelectedId)?.name || '—'}
                        </strong>
                      </p>
                    ) : null}
                    <div className="barcode-dialog-actions">
                      <button
                        type="button"
                        className="admin-btn-row"
                        onClick={() => {
                          setBarcodeLinkMode('create')
                          setBarcodeLinkSelectedId(null)
                        }}
                      >
                        Zurück
                      </button>
                      <button
                        type="button"
                        className="admin-btn-row admin-btn-row--save"
                        onClick={() => void confirmLinkBarcodeToArtikel()}
                      >
                        Barcode zuordnen
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {barcodeLookupMessage ? <p className="barcode-dialog-status">{barcodeLookupMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

export default App
