import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Filter,
  History,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { pb } from '../lib/pocketbase'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { APP_ROLES, recordCanManageUsers } from '../lib/userCapabilities'
import { avatarInitials } from '../lib/avatarInitials'
import { cn } from '../lib/cn.js'
import { isUserPresenceOnline, USER_PRESENCE_ONLINE_MS } from '../lib/userPresence.js'

const INV = PB_COLLECTIONS.userInvites

const ROLE_OPTIONS = [
  { value: APP_ROLES.inventur, label: 'Inventur' },
  { value: APP_ROLES.lagerleiter, label: 'Lagerleiter' },
  { value: APP_ROLES.magazin_readonly, label: 'Magazin (nur lesen)' },
  { value: APP_ROLES.admin, label: 'Administrator' },
  { value: 'users', label: 'Benutzer (Legacy)' },
]

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'Alle Rollen' },
  { value: APP_ROLES.admin, label: 'Administrator' },
  { value: APP_ROLES.lagerleiter, label: 'Lagerleiter' },
  { value: APP_ROLES.inventur, label: 'Inventur' },
]

function authHeaders() {
  const token = pb.authStore.token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const HINWEIS_401 =
  ' Gleiche Browser-URL wie beim Login nutzen (127.0.0.1 und localhost sind getrennte Sessions). Ggf. ab- und wieder anmelden; Token prüfen (Sitzung abgelaufen).'

function aufbereitenApi401(status, errText) {
  const t = String(errText || '').trim()
  if (status !== 401) return t || `HTTP ${status}`
  if (/nicht angemeldet/i.test(t)) return `${t || 'Nicht angemeldet.'}${HINWEIS_401}`
  return t ? `${t}${HINWEIS_401}` : `HTTP 401${HINWEIS_401}`
}

const HINWEIS_USER_API =
  ' Für die Mitarbeiter-Verwaltung: Express starten (`npm run server`, Port 3000 — Vite leitet `/api` dorthin). In `.env`: `POCKETBASE_URL` sowie `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` für den PocketBase-Superuser (Dashboard `/_`, nicht der normale App-Login).'

async function apiGetUsers() {
  const r = await fetch('/api/users', { headers: authHeaders() })
  const raw = await r.text()
  let data
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = undefined
  }
  if (!r.ok) {
    const errObj = data && typeof data === 'object' && !Array.isArray(data) ? data : null
    const fromApi = errObj?.error ?? errObj?.message
    const base = aufbereitenApi401(r.status, typeof fromApi === 'string' ? fromApi : '')
    if (typeof fromApi === 'string' && fromApi.trim()) {
      throw new Error(base)
    }
    throw new Error(`${base}${HINWEIS_USER_API}`)
  }
  return Array.isArray(data) ? data : []
}

async function apiPatchUser(id, body) {
  const r = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(aufbereitenApi401(r.status, data.error))
  return data
}

async function apiDeleteUser(id) {
  const r = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (r.status === 204) return
  const data = await r.json().catch(() => ({}))
  throw new Error(aufbereitenApi401(r.status, data.error))
}

/** E-Mail/Nutzer freischalten (PocketBase `verified`/`confirmed`) — nur mit laufendem Express + Admin-Token. */
async function apiConfirmUser(id) {
  const r = await fetch(`/api/users/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(aufbereitenApi401(r.status, data.error))
  return data
}

/** Bestätigung zurücksetzen (Admin über PocketBase-Admin-Token). */
async function apiUnconfirmUser(id) {
  const r = await fetch(`/api/users/${encodeURIComponent(id)}/unconfirm`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(aufbereitenApi401(r.status, data.error))
  return data
}

function displayNameForUser(u) {
  const self = pb.authStore.model
  if (self?.id && u.id === self.id) {
    const fromSession = [self.firstName, self.lastName].filter(Boolean).join(' ').trim()
    if (fromSession) return fromSession
  }
  const api = String(u.displayName ?? '').trim()
  if (api) return api
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return n || '—'
}

function roleLabel(value) {
  return ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function hueFromSeed(seed) {
  const s = String(seed || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

function appBaseUrlForInvite() {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

async function postInviteSendEmail(body) {
  const token = pb.authStore.token
  const r = await fetch('/api/invite/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = data.error || `HTTP ${r.status}`
    throw new Error(typeof msg === 'string' ? msg : 'Anfrage fehlgeschlagen.')
  }
  return data
}

function isPendingInvite(inv) {
  if (inv.consumed_at) return false
  const exp = inv.expires_at ? new Date(inv.expires_at) : null
  if (exp && Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) return false
  return true
}

function userMatchesRoleFilter(u, filter) {
  if (!filter) return true
  const r = String(u.role ?? '')
  if (filter === APP_ROLES.admin) return r === 'admin'
  if (filter === APP_ROLES.lagerleiter) return r === 'lagerleiter'
  if (filter === APP_ROLES.inventur) return r === 'inventur' || r === 'users'
  return true
}

/** @param {Record<string, string[]>} assignMap @param {{ id: string, lagerName: string }[]} pickList */
function lagerColumnText(userId, assignMap, pickList) {
  const ids = assignMap[userId] ?? []
  if (ids.length === 0) return '—'
  const lagerNames = new Set()
  for (const id of ids) {
    const p = pickList.find((x) => x.id === id)
    if (p?.lagerName) lagerNames.add(p.lagerName)
  }
  const arr = [...lagerNames]
  if (arr.length === 0) return `${ids.length} Bereiche`
  if (arr.length <= 2) return arr.join(', ')
  return `${arr.length} Lager`
}

function inviteMatchesRoleFilter(inv, filter) {
  if (!filter) return true
  const raw = String(inv.target_role ?? '')
    .trim()
    .toLowerCase()
  const isAdm = Boolean(inv.target_is_admin) || raw === 'admin'
  if (filter === APP_ROLES.admin) return isAdm
  if (filter === APP_ROLES.lagerleiter) return raw === 'lagerleiter'
  if (filter === APP_ROLES.inventur) {
    return raw === 'inventur' || raw === 'users' || raw === 'magazin_readonly' || (!isAdm && raw !== 'lagerleiter')
  }
  return true
}

function formatRelativeDe(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'vor wenigen Sekunden'
  const min = Math.floor(sec / 60)
  if (min < 60) return `vor ${min} Min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1) return 'gestern'
  if (d < 7) return `vor ${d} Tagen`
  const w = Math.floor(d / 7)
  if (w < 5) return `vor ${w} Woche${w === 1 ? '' : 'n'}`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateDe(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Mitarbeiter: Tabelle + festes Detail-Panel (Redesign).
 */
export default function MitarbeiterVerwaltenSection() {
  const selfId = pb.authStore.model?.id
  const canManageInvites = recordCanManageUsers(pb.authStore.model ?? undefined)
  const canManageLagerZuordnung = canManageInvites

  const [tenantLabel, setTenantLabel] = useState('Ihr Unternehmen')
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [loadBusy, setLoadBusy] = useState(false)
  const [statusTab, setStatusTab] = useState(/** @type {'all' | 'active' | 'inactive' | 'invites'} */ ('all'))
  const [roleFilter, setRoleFilter] = useState('')
  const [roleFilterOpen, setRoleFilterOpen] = useState(false)
  const roleFilterRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const [selectedKey, setSelectedKey] = useState(/** @type {string | null} */ (null))

  const [rowMenuKey, setRowMenuKey] = useState(/** @type {string | null} */ (null))
  const [inlineRoleOpenId, setInlineRoleOpenId] = useState(/** @type {string | null} */ (null))

  const [panelFirst, setPanelFirst] = useState('')
  const [panelLast, setPanelLast] = useState('')
  const [panelEmail, setPanelEmail] = useState('')
  const [panelRole, setPanelRole] = useState(APP_ROLES.inventur)
  const [panelVerified, setPanelVerified] = useState(true)

  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState(APP_ROLES.inventur)
  const [inviteDays, setInviteDays] = useState(7)
  const [inviteBusy, setInviteBusy] = useState(false)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPass, setCreatePass] = useState('')
  const [createPass2, setCreatePass2] = useState('')
  const [createRole, setCreateRole] = useState(APP_ROLES.inventur)
  const [createBusy, setCreateBusy] = useState(false)

  const [detailBusy, setDetailBusy] = useState(false)

  /** Alle Unterlager des Mandanten (für Anzeige + Zuweisung). */
  const [unterlagerPickList, setUnterlagerPickList] = useState(/** @type {{ id: string, name: string, lagerName: string }[]} */ ([]))
  /** userId → zugewiesene Unterlager-IDs */
  const [lagerAssignMap, setLagerAssignMap] = useState(/** @type {Record<string, string[]>} */ ({}))
  const [panelUnterSet, setPanelUnterSet] = useState(() => new Set())
  const [assignBusy, setAssignBusy] = useState(false)
  const [presenceNow, setPresenceNow] = useState(() => Date.now())

  const loadUsers = useCallback(async () => {
    if (!pb.authStore.token) {
      throw new Error(
        `Kein Anmelde-Token. Bitte einloggen — dieselbe Adresse wie jetzt (${typeof window !== 'undefined' ? window.location.origin : ''}).`
      )
    }
    try {
      await pb.collection(PB_COLLECTIONS.users).authRefresh({ requestKey: null })
    } catch {
      /* */
    }
    const list = await apiGetUsers()
    setUsers(list)
  }, [])

  const loadInvites = useCallback(async () => {
    if (!canManageInvites) {
      setInvites([])
      return
    }
    try {
      const list = await pb.collection(INV).getFullList({ sort: '-created', requestKey: null })
      setInvites(list)
    } catch {
      setInvites([])
    }
  }, [canManageInvites])

  const loadLagerZuordnungen = useCallback(async () => {
    const m = pb.authStore.model
    const tid = typeof m?.tenant_id === 'string' ? m.tenant_id : m?.tenant_id?.id
    if (!tid) {
      setUnterlagerPickList([])
      setLagerAssignMap({})
      return
    }
    try {
      const lagers = await pb.collection(PB_COLLECTIONS.lager).getFullList({
        filter: `standort = "${tid}"`,
        sort: 'sort_index,name',
        requestKey: null,
      })
      const aktiv = lagers.filter((l) => l.aktiv !== false)
      const lagerIds = aktiv.map((l) => l.id)
      const pick = []
      if (lagerIds.length > 0) {
        const or = lagerIds.map((id) => `lager = "${id}"`).join(' || ')
        const uls = await pb.collection(PB_COLLECTIONS.unterlager).getFullList({
          filter: `(${or})`,
          sort: 'sort_index,name',
          expand: 'lager',
          requestKey: null,
        })
        for (const u of uls) {
          if (u.aktiv === false) continue
          const ln = u.expand?.lager?.name
            ? String(u.expand.lager.name)
            : aktiv.find((x) => x.id === (typeof u.lager === 'string' ? u.lager : u.lager?.id))?.name ?? '—'
          pick.push({ id: u.id, name: String(u.name ?? '').trim() || '—', lagerName: ln })
        }
      }
      setUnterlagerPickList(pick)

      const links = await pb.collection(PB_COLLECTIONS.userUnterlager).getFullList({
        filter: `unterlager.lager.standort = "${tid}"`,
        expand: 'nutzer,unterlager',
        requestKey: null,
      })
      /** @type {Record<string, string[]>} */
      const byUser = {}
      for (const row of links) {
        const uid = typeof row.nutzer === 'string' ? row.nutzer : row.nutzer?.id ?? row.expand?.nutzer?.id
        const ulid =
          typeof row.unterlager === 'string' ? row.unterlager : row.unterlager?.id ?? row.expand?.unterlager?.id
        if (!uid || !ulid) continue
        if (!byUser[uid]) byUser[uid] = []
        byUser[uid].push(ulid)
      }
      setLagerAssignMap(byUser)
    } catch {
      setUnterlagerPickList([])
      setLagerAssignMap({})
    }
  }, [])

  const reloadAll = useCallback(async () => {
    setLoadBusy(true)
    try {
      await loadUsers()
      await loadInvites()
      await loadLagerZuordnungen()
    } catch (e) {
      toast.error(e?.message || 'Laden fehlgeschlagen.')
      setUsers([])
    } finally {
      setLoadBusy(false)
    }
  }, [loadUsers, loadInvites, loadLagerZuordnungen])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  useEffect(() => {
    const id = window.setInterval(() => setPresenceNow(Date.now()), 25000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadUsers().catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [loadUsers])

  useEffect(() => {
    let cancelled = false
    const tid = pb.authStore.model?.tenant_id
    const id = typeof tid === 'string' ? tid : tid?.id
    if (!id) {
      setTenantLabel('Ihr Unternehmen')
      return
    }
    ;(async () => {
      try {
        const rec = await pb.collection(PB_COLLECTIONS.standorte).getOne(id, { requestKey: null })
        if (!cancelled) setTenantLabel(String(rec.name ?? '').trim() || 'Ihr Unternehmen')
      } catch {
        if (!cancelled) setTenantLabel('Ihr Unternehmen')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onDoc = (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (roleFilterRef.current && !roleFilterRef.current.contains(t)) setRoleFilterOpen(false)
      if (!t.closest('[data-mitarbeiter-inline-role]')) setInlineRoleOpenId(null)
      if (!t.closest('[data-mitarbeiter-row-menu]')) setRowMenuKey(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pendingInvites = useMemo(() => invites.filter(isPendingInvite), [invites])

  const counts = useMemo(() => {
    const active = users.filter((u) => isUserPresenceOnline(u.lastActiveAt, presenceNow)).length
    const inactive = users.filter((u) => !isUserPresenceOnline(u.lastActiveAt, presenceNow)).length
    return {
      all: users.length,
      active,
      inactive,
      invites: pendingInvites.length,
    }
  }, [users, pendingInvites.length, presenceNow])

  const filteredRows = useMemo(() => {
    if (statusTab === 'invites') {
      return pendingInvites.filter((inv) => inviteMatchesRoleFilter(inv, roleFilter)).map((inv) => ({ kind: 'invite', inv }))
    }
    let list = users
    if (statusTab === 'active') list = list.filter((u) => isUserPresenceOnline(u.lastActiveAt, presenceNow))
    if (statusTab === 'inactive') list = list.filter((u) => !isUserPresenceOnline(u.lastActiveAt, presenceNow))
    list = list.filter((u) => userMatchesRoleFilter(u, roleFilter))
    return list.map((u) => ({ kind: 'user', u }))
  }, [users, pendingInvites, statusTab, roleFilter, presenceNow])

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedKey(null)
      return
    }
    if (!selectedKey || !filteredRows.some((r) => rowKey(r) === selectedKey)) {
      setSelectedKey(rowKey(filteredRows[0]))
    }
  }, [filteredRows, selectedKey])

  const selectedRow = useMemo(() => {
    if (!selectedKey) return null
    return filteredRows.find((r) => rowKey(r) === selectedKey) ?? null
  }, [filteredRows, selectedKey])

  const panelSyncUser = selectedRow?.kind === 'user' ? selectedRow.u : null
  useEffect(() => {
    if (!panelSyncUser) return
    setPanelFirst(String(panelSyncUser.firstName ?? '').trim())
    setPanelLast(String(panelSyncUser.lastName ?? '').trim())
    setPanelEmail(String(panelSyncUser.email ?? '').trim())
    setPanelRole(panelSyncUser.role || APP_ROLES.inventur)
    setPanelVerified(Boolean(panelSyncUser.emailConfirmed))
  }, [
    panelSyncUser?.id,
    panelSyncUser?.firstName,
    panelSyncUser?.lastName,
    panelSyncUser?.email,
    panelSyncUser?.role,
    panelSyncUser?.emailConfirmed,
  ])

  const selectedUser = selectedRow?.kind === 'user' ? selectedRow.u : null
  const selectedInvite = selectedRow?.kind === 'invite' ? selectedRow.inv : null

  const panelDirtyUser =
    selectedUser &&
    (panelFirst.trim() !== String(selectedUser.firstName ?? '').trim() ||
      panelLast.trim() !== String(selectedUser.lastName ?? '').trim() ||
      panelEmail.trim().toLowerCase() !== String(selectedUser.email ?? '').trim().toLowerCase() ||
      (selectedUser.id !== selfId && panelRole !== selectedUser.role) ||
      panelVerified !== Boolean(selectedUser.emailConfirmed))

  const panelUnterDirty = useMemo(() => {
    if (!selectedUser) return false
    const a = [...(lagerAssignMap[selectedUser.id] ?? [])].sort().join('\0')
    const b = [...panelUnterSet].sort().join('\0')
    return a !== b
  }, [selectedUser?.id, lagerAssignMap, panelUnterSet])

  useEffect(() => {
    if (!panelSyncUser) {
      setPanelUnterSet(new Set())
      return
    }
    setPanelUnterSet(new Set(lagerAssignMap[panelSyncUser.id] ?? []))
  }, [panelSyncUser?.id, lagerAssignMap])

  const unterByLager = useMemo(() => {
    const m = new Map()
    for (const o of unterlagerPickList) {
      const k = o.lagerName || '—'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(o)
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0], 'de'))
  }, [unterlagerPickList])

  const adminCount = useMemo(
    () => users.filter((u) => u.role === APP_ROLES.admin || u.isAdmin).length,
    [users]
  )

  const saveRoleInline = async (userId, newRole) => {
    const u = users.find((x) => x.id === userId)
    if (!u || userId === selfId) return
    if ((u.role === APP_ROLES.admin || u.isAdmin) && newRole !== APP_ROLES.admin && adminCount <= 1) {
      toast.error('Der letzte Administrator kann nicht herabgestuft werden.')
      return
    }
    try {
      const updated = await apiPatchUser(userId, { role: newRole })
      setUsers((prev) => prev.map((r) => (r.id === userId ? updated : r)))
      toast.success('Rolle aktualisiert')
    } catch (e) {
      toast.error(e?.message || 'Rolle konnte nicht gespeichert werden.')
    }
    setInlineRoleOpenId(null)
  }

  const discardPanel = () => {
    if (!selectedUser) return
    const u = selectedUser
    setPanelFirst(String(u.firstName ?? '').trim())
    setPanelLast(String(u.lastName ?? '').trim())
    setPanelEmail(String(u.email ?? '').trim())
    setPanelRole(u.role || APP_ROLES.inventur)
    setPanelVerified(Boolean(u.emailConfirmed))
    setPanelUnterSet(new Set(lagerAssignMap[u.id] ?? []))
  }

  const savePanel = async () => {
    if (!selectedUser || !panelDirtyUser) return
    const u = selectedUser
    setDetailBusy(true)
    try {
      if ((u.role === APP_ROLES.admin || u.isAdmin) && panelRole !== APP_ROLES.admin && adminCount <= 1) {
        toast.error('Der letzte Administrator kann nicht herabgestuft werden.')
        return
      }
      const emailChanged = panelEmail.trim().toLowerCase() !== String(u.email ?? '').trim().toLowerCase()
      const roleChanged = u.id !== selfId && panelRole !== u.role
      if (emailChanged || roleChanged) {
        const patch = {}
        if (emailChanged) patch.email = panelEmail.trim().toLowerCase()
        if (roleChanged) patch.role = panelRole
        const updated = await apiPatchUser(u.id, patch)
        setUsers((prev) => prev.map((r) => (r.id === u.id ? updated : r)))
      }
      const nameChanged =
        panelFirst.trim() !== String(u.firstName ?? '').trim() ||
        panelLast.trim() !== String(u.lastName ?? '').trim()
      const verifiedChanged = panelVerified !== Boolean(u.emailConfirmed)
      if (nameChanged) {
        await pb.collection(PB_COLLECTIONS.users).update(u.id, {
          first_name: panelFirst.trim(),
          last_name: panelLast.trim(),
        })
      }
      if (verifiedChanged) {
        if (panelVerified) {
          await apiConfirmUser(u.id)
        } else {
          await apiUnconfirmUser(u.id)
        }
      }
      if (nameChanged || verifiedChanged) {
        await loadUsers()
      }
      toast.success('Gespeichert.')
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || e?.message || 'Speichern fehlgeschlagen.')
    } finally {
      setDetailBusy(false)
    }
  }

  const deleteSelectedUser = async () => {
    if (!selectedUser || selectedUser.id === selfId) return
    if (!window.confirm('Nutzer wirklich löschen?')) return
    setDetailBusy(true)
    try {
      await apiDeleteUser(selectedUser.id)
      toast.success('Nutzer gelöscht.')
      setSelectedKey(null)
      await loadUsers()
    } catch (e) {
      toast.error(e?.message || 'Löschen fehlgeschlagen.')
    } finally {
      setDetailBusy(false)
    }
  }

  const sendPasswordReset = async () => {
    if (!selectedUser?.email) return
    try {
      await pb.collection(PB_COLLECTIONS.users).requestPasswordReset(selectedUser.email)
      toast.success('Reset-Link wurde angefordert (falls die E-Mail existiert).')
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || 'Anforderung fehlgeschlagen.')
    }
  }

  const saveLagerAssignments = async () => {
    if (!selectedUser || !panelUnterDirty || !canManageLagerZuordnung) return
    const userId = selectedUser.id
    const prev = new Set(lagerAssignMap[userId] ?? [])
    const next = panelUnterSet
    setAssignBusy(true)
    try {
      const toAdd = [...next].filter((id) => !prev.has(id))
      const toRem = [...prev].filter((id) => !next.has(id))
      for (const ulId of toAdd) {
        await pb.collection(PB_COLLECTIONS.userUnterlager).create(
          { nutzer: userId, unterlager: ulId },
          { requestKey: null }
        )
      }
      for (const ulId of toRem) {
        const rows = await pb.collection(PB_COLLECTIONS.userUnterlager).getFullList({
          filter: `nutzer = "${userId}" && unterlager = "${ulId}"`,
          requestKey: null,
        })
        for (const r of rows) {
          await pb.collection(PB_COLLECTIONS.userUnterlager).delete(r.id, { requestKey: null })
        }
      }
      await loadLagerZuordnungen()
      toast.success('Lager-Zuweisungen gespeichert.')
    } catch (e) {
      toast.error(pocketBaseFullErrorMessage(e) || e?.message || 'Zuweisungen fehlgeschlagen.')
    } finally {
      setAssignBusy(false)
    }
  }

  const submitInviteModal = async (e) => {
    e.preventDefault()
    const mail = inviteEmail.trim().toLowerCase()
    if (!mail) {
      toast.error('E-Mail ist Pflicht.')
      return
    }
    const days = Math.min(90, Math.max(1, Number(inviteDays) || 7))
    const isAdminRole = inviteRole === APP_ROLES.admin
    const roleToSend = isAdminRole ? APP_ROLES.admin : inviteRole
    setInviteBusy(true)
    try {
      const data = await postInviteSendEmail({
        email: mail,
        targetRole: roleToSend,
        validDays: days,
        appBaseUrl: appBaseUrlForInvite(),
      })
      setInviteEmail('')
      setInviteModalOpen(false)
      await loadInvites()
      if (data.mailSent === false) {
        toast.success('Einladung angelegt (ohne SMTP). Link ggf. manuell teilen.')
      } else {
        toast.success('Einladung per E-Mail gesendet.')
      }
    } catch (err) {
      toast.error(err?.message || 'Versand fehlgeschlagen.')
    } finally {
      setInviteBusy(false)
    }
  }

  const submitCreateUser = async (e) => {
    e.preventDefault()
    const mail = createEmail.trim().toLowerCase()
    if (!mail) {
      toast.error('E-Mail ist Pflicht.')
      return
    }
    if (createPass.length < 8) {
      toast.error('Passwort mindestens 8 Zeichen.')
      return
    }
    if (createPass !== createPass2) {
      toast.error('Passwörter stimmen nicht überein.')
      return
    }
    const tid = pb.authStore.model?.tenant_id
    const tenantId = typeof tid === 'string' ? tid : tid?.id
    setCreateBusy(true)
    try {
      const record = await pb.collection(PB_COLLECTIONS.users).create({
        email: mail,
        password: createPass,
        passwordConfirm: createPass2,
        emailVisibility: false,
        role: createRole,
        is_admin: createRole === APP_ROLES.admin,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      })
      setCreateModalOpen(false)
      setCreateEmail('')
      setCreatePass('')
      setCreatePass2('')
      try {
        await apiConfirmUser(record.id)
        toast.success('Nutzer angelegt und zur Anmeldung freigeschaltet.')
      } catch (confirmErr) {
        toast.success('Nutzer angelegt.')
        toast.warning(
          `Automatische Freischaltung fehlgeschlagen: ${confirmErr?.message || 'App-Server nicht erreichbar'}. Ohne Express (\`npm run server\`) den Nutzer in PocketBase als bestätigt markieren oder Einladungsflow nutzen.`
        )
      }
      await loadUsers()
    } catch (err) {
      toast.error(pocketBaseFullErrorMessage(err) || 'Anlegen fehlgeschlagen.')
    } finally {
      setCreateBusy(false)
    }
  }

  const resendInvite = async () => {
    if (!selectedInvite) return
    const mail = String(selectedInvite.email ?? '')
      .trim()
      .toLowerCase()
    if (!mail) return
    const raw = String(selectedInvite.target_role ?? '')
      .trim()
      .toLowerCase()
    const isAdm = Boolean(selectedInvite.target_is_admin) || raw === APP_ROLES.admin
    const roleToSend = isAdm ? APP_ROLES.admin : raw || APP_ROLES.inventur
    setDetailBusy(true)
    try {
      await postInviteSendEmail({
        email: mail,
        targetRole: roleToSend,
        validDays: 7,
        appBaseUrl: appBaseUrlForInvite(),
      })
      toast.success('Einladung erneut gesendet (oder angelegt).')
      await loadInvites()
    } catch (e) {
      toast.error(e?.message || 'Versand fehlgeschlagen.')
    } finally {
      setDetailBusy(false)
    }
  }

  const tabBtn = (id, label, count) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={statusTab === id}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-1 pb-2 text-[13px] font-medium transition-colors',
        statusTab === id
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
      onClick={() => setStatusTab(id)}
    >
      {label}{' '}
      <span className="tabular-nums text-muted-foreground">({count})</span>
    </button>
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="mitarbeiter-page-h1">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h1 id="mitarbeiter-page-h1" className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">
            Mitarbeiter
          </h1>
        </div>
      </header>

      <div className="mb-3 flex min-h-[40px] flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-4" role="tablist" aria-label="Status">
          {tabBtn('all', 'Alle', counts.all)}
          {tabBtn('active', 'Aktiv', counts.active)}
          {tabBtn('inactive', 'Inaktiv', counts.inactive)}
          {canManageInvites ? tabBtn('invites', 'Einladungen', counts.invites) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canManageInvites ? (
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium text-foreground hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Einladen
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nutzer anlegen
          </button>
        </div>
      </div>

      <div className="flex min-h-[min(560px,calc(100vh-13rem))] min-w-0 flex-1 gap-0 overflow-hidden rounded-md border border-border bg-background">
        <div className="min-w-0 flex-1 overflow-auto">
          {loadBusy && users.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Laden …</p>
          ) : filteredRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/30">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">E-Mail</th>
                  <th className="px-3 py-2.5 font-medium">Rolle</th>
                  <th
                    className="px-3 py-2.5 font-medium"
                    title={`Online: Signal aus der Inventur/App in den letzten ${Math.round(USER_PRESENCE_ONLINE_MS / 60000)} Min.`}
                  >
                    Status
                  </th>
                  <th className="px-3 py-2.5 font-medium">Lager (Inventur)</th>
                  <th className="w-10 px-2 py-2.5" aria-label="Aktionen" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const key = rowKey(row)
                  const sel = key === selectedKey
                  if (row.kind === 'invite') {
                    const inv = row.inv
                    const em = String(inv.email ?? '')
                    return (
                      <tr
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedKey(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedKey(key)
                          }
                        }}
                        className={cn(
                          'cursor-pointer border-b border-border transition-colors',
                          sel ? 'border-l-2 border-l-primary bg-primary/5' : 'hover:bg-muted/40'
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                              style={{ backgroundColor: `hsl(${hueFromSeed(em)} 32% 42%)` }}
                              aria-hidden
                            >
                              {avatarInitials('', '', em)}
                            </div>
                            <span className="text-[13px] italic text-muted-foreground">{em || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {roleLabel(
                            Boolean(inv.target_is_admin) || String(inv.target_role ?? '').toLowerCase() === 'admin'
                              ? APP_ROLES.admin
                              : String(inv.target_role ?? APP_ROLES.inventur)
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex h-5 w-fit items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 text-[11px] font-medium tabular-nums text-amber-800 dark:text-amber-200">
                              <span className="h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
                              Einladung ausstehend
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              Eingeladen {formatRelativeDe(inv.created)}
                            </span>
                          </div>
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5 text-[12px] text-muted-foreground">—</td>
                        <td className="px-2 py-2.5" aria-hidden />
                      </tr>
                    )
                  }
                  const u = row.u
                  const isSelf = u.id === selfId
                  const dn = displayNameForUser(u)
                  const seed = u.id || u.email
                  const presenceOnline = isUserPresenceOnline(u.lastActiveAt, presenceNow)
                  return (
                    <tr
                      key={key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedKey(key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedKey(key)
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-b border-border transition-colors',
                        sel ? 'border-l-2 border-l-primary bg-primary/5' : 'hover:bg-muted/40'
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ backgroundColor: `hsl(${hueFromSeed(seed)} 32% 42%)` }}
                            aria-hidden
                          >
                            {avatarInitials(u.firstName, u.lastName, u.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-foreground">{dn}</div>
                            {isSelf ? (
                              <div className="text-[11px] text-muted-foreground">(eigenes Konto)</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-[12.5px] text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block" data-mitarbeiter-inline-role>
                          <button
                            type="button"
                            disabled={isSelf || loadBusy}
                            onClick={(e) => {
                              e.stopPropagation()
                              setInlineRoleOpenId((id) => (id === u.id ? null : u.id))
                            }}
                            className={cn(
                              'inline-flex h-[26px] max-w-[11rem] items-center gap-1 rounded-md border border-input bg-background px-2 text-[12px] font-medium',
                              'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
                            )}
                          >
                            <span className="truncate">{roleLabel(u.role)}</span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                          </button>
                          {inlineRoleOpenId === u.id ? (
                            <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-border bg-background py-1 shadow-md">
                              {ROLE_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  type="button"
                                  className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-muted"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void saveRoleInline(u.id, o.value)
                                  }}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {presenceOnline ? (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium tabular-nums text-emerald-800 dark:text-emerald-200">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                            Aktiv
                          </span>
                        ) : (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-[11px] font-medium tabular-nums text-muted-foreground">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                            Inaktiv
                          </span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5 text-[12px] text-muted-foreground">
                        {lagerColumnText(u.id, lagerAssignMap, unterlagerPickList)}
                      </td>
                      <td className="relative px-2 py-2.5 text-right" data-mitarbeiter-row-menu>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                          aria-label="Menü"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRowMenuKey((k) => (k === key ? null : key))
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {rowMenuKey === key ? (
                          <div className="absolute right-2 top-full z-30 mt-1 w-40 rounded-md border border-border bg-background py-1 shadow-md">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-[12px] text-destructive hover:bg-muted disabled:opacity-40"
                              disabled={isSelf}
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuKey(null)
                                if (!isSelf)
                                  void (async () => {
                                    if (!window.confirm('Nutzer wirklich löschen?')) return
                                    try {
                                      await apiDeleteUser(u.id)
                                      toast.success('Nutzer gelöscht.')
                                      if (selectedKey === key) setSelectedKey(null)
                                      await reloadAll()
                                    } catch (err) {
                                      toast.error(err?.message || 'Löschen fehlgeschlagen.')
                                    }
                                  })()
                              }}
                            >
                              Löschen
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside
          className="flex w-[380px] shrink-0 flex-col border-l border-border bg-muted/25"
          aria-label="Detail"
        >
          {!selectedRow ? (
            <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
              Keine Auswahl
            </div>
          ) : selectedInvite ? (
            <>
              <div className="shrink-0 border-b border-background bg-background px-4 py-4 text-center">
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{
                    backgroundColor: `hsl(${hueFromSeed(selectedInvite.email)} 32% 42%)`,
                  }}
                >
                  {avatarInitials('', '', selectedInvite.email)}
                </div>
                <p className="mt-3 text-base font-semibold text-foreground">{selectedInvite.email}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Einladung</p>
                <div className="mt-2 flex justify-center">
                  <span className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                    <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                    Einladung ausstehend
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[12.5px]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aktivität</p>
                <p className="mt-2 text-muted-foreground">Eingeladen: {formatDateDe(selectedInvite.created)}</p>
                <p className="mt-1 text-muted-foreground">Gültig bis: {selectedInvite.expires_at ? formatDateDe(selectedInvite.expires_at) : '—'}</p>
                <hr className="my-4 border-border" />
                <button
                  type="button"
                  disabled={detailBusy || !canManageInvites}
                  onClick={() => void resendInvite()}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Einladung erneut senden
                </button>
              </div>
            </>
          ) : selectedUser ? (
            <>
              <div className="shrink-0 border-b border-background bg-background px-4 py-4 text-center">
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{
                    backgroundColor: `hsl(${hueFromSeed(selectedUser.id || selectedUser.email)} 32% 42%)`,
                  }}
                >
                  {avatarInitials(selectedUser.firstName, selectedUser.lastName, selectedUser.email)}
                </div>
                <p className="mt-3 text-base font-semibold text-foreground">{displayNameForUser(selectedUser)}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{selectedUser.email}</p>
                <div className="mt-2 flex justify-center">
                  {isUserPresenceOnline(selectedUser.lastActiveAt, presenceNow) ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                      <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
                      Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-[11px] font-medium text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/60" aria-hidden />
                      Inaktiv
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Letztes App‑Signal: {formatRelativeDe(selectedUser.lastActiveAt)}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-[100px_1fr] items-center gap-x-3 gap-y-3">
                  <label htmlFor="mp-first" className="text-[12.5px] text-muted-foreground">
                    Name
                  </label>
                  <input
                    id="mp-first"
                    value={panelFirst}
                    onChange={(e) => setPanelFirst(e.target.value)}
                    disabled={detailBusy}
                    placeholder="Vorname"
                    className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
                  />
                  <span className="text-[12.5px] text-muted-foreground"> </span>
                  <input
                    value={panelLast}
                    onChange={(e) => setPanelLast(e.target.value)}
                    disabled={detailBusy}
                    placeholder="Nachname"
                    className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
                  />
                  <label htmlFor="mp-email" className="text-[12.5px] text-muted-foreground">
                    E-Mail
                  </label>
                  <input
                    id="mp-email"
                    type="email"
                    value={panelEmail}
                    onChange={(e) => setPanelEmail(e.target.value)}
                    disabled={detailBusy}
                    className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px]"
                  />
                  <label htmlFor="mp-role" className="text-[12.5px] text-muted-foreground">
                    Rolle
                  </label>
                  <select
                    id="mp-role"
                    value={panelRole}
                    onChange={(e) => setPanelRole(e.target.value)}
                    disabled={detailBusy || selectedUser.id === selfId}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12.5px]"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="self-center text-[12.5px] text-muted-foreground">Status</span>
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
                    <input
                      type="checkbox"
                      checked={panelVerified}
                      onChange={(e) => setPanelVerified(e.target.checked)}
                      disabled={detailBusy}
                      className="h-4 w-4 rounded border-input"
                    />
                    Anmeldung erlaubt
                  </label>
                </div>
                <hr className="my-4 border-border" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Lager & Bereiche (Inventur)
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Sichtbare Standorte im Zähler für die Rolle „Inventur“ (über Unterlager-Zuweisungen).
                </p>
                {unterlagerPickList.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">Keine aktiven Lager/Unterlager im Mandanten.</p>
                ) : (
                  <div className="mt-3 max-h-[min(240px,40vh)] space-y-3 overflow-y-auto pr-1">
                    {unterByLager.map(([lagerName, items]) => (
                      <div key={lagerName}>
                        <p className="text-[12px] font-medium text-foreground">{lagerName}</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {items.map((o) => (
                            <li key={o.id}>
                              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-foreground">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                                  checked={panelUnterSet.has(o.id)}
                                  disabled={assignBusy || detailBusy || !canManageLagerZuordnung}
                                  onChange={() => {
                                    setPanelUnterSet((prev) => {
                                      const n = new Set(prev)
                                      if (n.has(o.id)) n.delete(o.id)
                                      else n.add(o.id)
                                      return n
                                    })
                                  }}
                                />
                                <span>{o.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {canManageLagerZuordnung && unterlagerPickList.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {panelUnterDirty ? (
                      <span className="text-[12px] text-muted-foreground">Nicht gespeicherte Zuweisungen</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveLagerAssignments()}
                      disabled={assignBusy || !panelUnterDirty}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Zuweisungen speichern
                    </button>
                  </div>
                ) : null}
                {!canManageLagerZuordnung && unterlagerPickList.length > 0 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">Nur lesend: keine Berechtigung zum Ändern.</p>
                ) : null}
                <hr className="my-4 border-border" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sicherheit</p>
                <button
                  type="button"
                  onClick={() => void sendPasswordReset()}
                  className="mt-2 inline-flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-[12.5px] font-medium hover:bg-muted"
                >
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Passwort zurücksetzen
                </button>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                  Sendet einen Reset-Link an die hinterlegte E-Mail.
                </p>
                <hr className="my-4 border-border" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aktivität</p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Konto angelegt: {formatDateDe(selectedUser.createdAt)}
                </p>
              </div>
              <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-4 py-3">
                <button
                  type="button"
                  onClick={() => void deleteSelectedUser()}
                  disabled={detailBusy || selectedUser.id === selfId}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Löschen
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {panelDirtyUser || panelUnterDirty ? (
                    <span className="text-[12px] text-muted-foreground">Nicht gespeicherte Änderungen</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={discardPanel}
                    disabled={detailBusy || assignBusy || (!panelDirtyUser && !panelUnterDirty)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] hover:bg-muted disabled:opacity-50"
                  >
                    Verwerfen
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePanel()}
                    disabled={detailBusy || !panelDirtyUser}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Speichern
                  </button>
                </div>
              </footer>
            </>
          ) : null}
        </aside>
      </div>

      {inviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">Nutzer einladen</h2>
            <form className="mt-4 space-y-3" onSubmit={submitInviteModal}>
              <div>
                <label htmlFor="imail" className="text-[12.5px] text-muted-foreground">
                  E-Mail
                </label>
                <input
                  id="imail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                  required
                />
              </div>
              <div>
                <label htmlFor="irole" className="text-[12.5px] text-muted-foreground">
                  Rolle
                </label>
                <select
                  id="irole"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                >
                  {ROLE_OPTIONS.filter((o) => o.value !== 'users').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="idays" className="text-[12.5px] text-muted-foreground">
                  Link gültig (Tage)
                </label>
                <input
                  id="idays"
                  type="number"
                  min={1}
                  max={90}
                  value={inviteDays}
                  onChange={(e) => setInviteDays(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px] tabular-nums"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="h-9 rounded-md border border-input px-3 text-[12.5px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={inviteBusy}
                  className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {inviteBusy ? '…' : 'Senden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">Nutzer anlegen</h2>
            <form className="mt-4 space-y-3" onSubmit={submitCreateUser}>
              <div>
                <label htmlFor="cemail" className="text-[12.5px] text-muted-foreground">
                  E-Mail
                </label>
                <input
                  id="cemail"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="crole" className="text-[12.5px] text-muted-foreground">
                  Rolle
                </label>
                <select
                  id="crole"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                >
                  {ROLE_OPTIONS.filter((o) => o.value !== 'users').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cp1" className="text-[12.5px] text-muted-foreground">
                  Passwort
                </label>
                <input
                  id="cp1"
                  type="password"
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="cp2" className="text-[12.5px] text-muted-foreground">
                  Passwort wiederholen
                </label>
                <input
                  id="cp2"
                  type="password"
                  value={createPass2}
                  onChange={(e) => setCreatePass2(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input px-2 text-[12.5px]"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="h-9 rounded-md border border-input px-3 text-[12.5px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {createBusy ? '…' : 'Anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function rowKey(row) {
  if (row.kind === 'user') return `u:${row.u.id}`
  return `i:${row.inv.id}`
}
