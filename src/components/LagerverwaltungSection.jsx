import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Box,
  Check,
  ChevronDown,
  History,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
  Warehouse,
  X,
} from 'lucide-react'
import { pb } from '../lib/pocketbase'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { formatUnterlagerLabel } from '../lib/lagerAccess'
import { recordPbAdmin } from '../lib/userCapabilities'
import { cn } from '../lib/cn.js'

const STANDORT_STORAGE_KEY = 'vibe-lager-standort-id'

/** @param {Record<string, unknown> | null | undefined} record */
function userTenantRelationId(record) {
  if (!record) return null
  const t = record.tenant_id
  if (typeof t === 'string' && t.trim()) return t.trim()
  if (typeof t?.id === 'string' && t.id.trim()) return t.id.trim()
  return null
}

/** @param {Record<string, unknown> | null | undefined} u */
function displayUserName(u) {
  if (!u) return '—'
  const fn = String(u.first_name ?? '').trim()
  const ln = String(u.last_name ?? '').trim()
  const full = [fn, ln].filter(Boolean).join(' ')
  return full || String(u.email ?? '').trim() || '—'
}

/**
 * @param {{ readOnly?: boolean, canAssignUsers?: boolean }} [props]
 */
export default function LagerverwaltungSection({ readOnly = false, canAssignUsers = false }) {
  const [standortId, setStandortId] = useState(null)
  const [standorteList, setStandorteList] = useState([])
  const [standort, setStandort] = useState(null)
  const [firmenname, setFirmenname] = useState('')
  const [anschrift, setAnschrift] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [lagers, setLagers] = useState([])
  const [unterByLager, setUnterByLager] = useState({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [newLagerName, setNewLagerName] = useState('')
  const [newUnter, setNewUnter] = useState({})
  const [users, setUsers] = useState([])
  const [allUnterlager, setAllUnterlager] = useState([])
  const [assignUserId, setAssignUserId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [lagerArticles, setLagerArticles] = useState([])
  const [lagerArticlesBusy, setLagerArticlesBusy] = useState(false)

  const [activeTab, setActiveTab] = useState(/** @type {'lager' | 'firma' | 'archiv'} */ ('lager'))
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [selectedLagerId, setSelectedLagerId] = useState(null)
  const [lagerNameDraft, setLagerNameDraft] = useState('')
  const [lagerDescDraft, setLagerDescDraft] = useState('')
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false)
  const tenantMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const newLagerInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const [artikelByLager, setArtikelByLager] = useState(/** @type {Record<string, number>} */ ({}))
  const [standorteInitDone, setStandorteInitDone] = useState(false)
  const [bootstrapStandortName, setBootstrapStandortName] = useState('')

  const loadLagers = useCallback(async (sid) => {
    if (!sid) {
      setLagers([])
      setUnterByLager({})
      return
    }
    const list = await pb.collection(PB_COLLECTIONS.lager).getFullList({
      filter: `standort = "${sid}"`,
      sort: 'sort_index,name',
      requestKey: null,
    })
    setLagers(list)
    const map = {}
    for (const l of list) {
      const ul = await pb.collection(PB_COLLECTIONS.unterlager).getFullList({
        filter: `lager = "${l.id}"`,
        sort: 'sort_index,name',
        requestKey: null,
      })
      map[l.id] = ul
    }
    setUnterByLager(map)
    const flat = []
    for (const l of list) {
      for (const u of map[l.id] || []) {
        flat.push({ ...u, expand: { lager: l } })
      }
    }
    setAllUnterlager(flat)
  }, [])

  const loadAssignments = useCallback(async () => {
    if (!canAssignUsers || !standortId) {
      setAssignments([])
      return
    }
    try {
      const rows = await pb.collection(PB_COLLECTIONS.userLager).getFullList({
        filter: `lager.standort = "${standortId}"`,
        expand: 'nutzer,lager',
        requestKey: null,
      })
      setAssignments(rows)
    } catch {
      setAssignments([])
    }
  }, [canAssignUsers, standortId])

  const loadUsers = useCallback(async () => {
    if (!canAssignUsers || !standortId) {
      setUsers([])
      return
    }
    try {
      const list = await pb.collection(PB_COLLECTIONS.users).getFullList({
        filter: `tenant_id = "${standortId}"`,
        sort: 'email',
        requestKey: null,
      })
      setUsers(list)
    } catch (err) {
      console.error('[LagerverwaltungSection] loadUsers fehlgeschlagen:', err)
      setUsers([])
    }
  }, [canAssignUsers, standortId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const m = pb.authStore.model
        if (!m) {
          if (!cancelled) setStandortId(null)
          return
        }
        let sid = userTenantRelationId(m)
        let list = []
        if (recordPbAdmin(m)) {
          try {
            list = await pb.collection(PB_COLLECTIONS.standorte).getFullList({
              sort: 'name',
              requestKey: null,
            })
            if (cancelled) return
            setStandorteList(list)
            try {
              const stored = sessionStorage.getItem(STANDORT_STORAGE_KEY)
              if (stored && list.some((s) => s.id === stored)) sid = stored
              else if (!sid && list[0]) sid = list[0].id
            } catch {
              if (!sid && list[0]) sid = list[0].id
            }
          } catch {
            if (!cancelled) setStandorteList([])
          }
        } else {
          if (!cancelled) setStandorteList([])
        }
        if (!cancelled) setStandortId(sid)
      } finally {
        if (!cancelled) setStandorteInitDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!standortId) {
      setStandort(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const rec = await pb.collection(PB_COLLECTIONS.standorte).getOne(standortId, { requestKey: null })
        if (cancelled) return
        setStandort(rec)
        setFirmenname(String(rec.name ?? ''))
        setAnschrift(String(rec.anschrift ?? ''))
      } catch {
        if (!cancelled) setStandort(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [standortId])

  useEffect(() => {
    if (!standortId) return
    void loadLagers(standortId)
  }, [standortId, loadLagers])

  useEffect(() => {
    void loadUsers()
    void loadAssignments()
  }, [loadUsers, loadAssignments])

  useEffect(() => {
    if (!standortId) {
      setArtikelByLager({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const list = await pb.collection(PB_COLLECTIONS.artikel).getFullList({
          filter: `tenant_id = "${standortId}"`,
          fields: 'lager',
          requestKey: null,
        })
        if (cancelled) return
        const m = {}
        for (const r of list) {
          const lid = typeof r.lager === 'string' ? r.lager : r.lager?.id
          if (!lid) continue
          m[lid] = (m[lid] || 0) + 1
        }
        setArtikelByLager(m)
      } catch {
        if (!cancelled) setArtikelByLager({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [standortId, lagers.length])

  useEffect(() => {
    if (!selectedLagerId) { setLagerArticles([]); return }
    let cancelled = false
    setLagerArticlesBusy(true)
    pb.collection(PB_COLLECTIONS.artikel).getFullList({
      filter: `lager = "${selectedLagerId}"`,
      sort: 'category,name',
      fields: 'id,name,preis,einheit,category',
      requestKey: null,
    }).then((list) => {
      if (!cancelled) setLagerArticles(list)
    }).catch(() => {
      if (!cancelled) setLagerArticles([])
    }).finally(() => {
      if (!cancelled) setLagerArticlesBusy(false)
    })
    return () => { cancelled = true }
  }, [selectedLagerId])

  useEffect(() => {
    const onDoc = (e) => {
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target)) setTenantMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const activeLagers = useMemo(
    () => lagers.filter((l) => l.aktiv !== false).sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0)),
    [lagers]
  )
  const archivedLagers = useMemo(() => lagers.filter((l) => l.aktiv === false), [lagers])

  const filteredSidebarLagers = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    if (!q) return activeLagers
    return activeLagers.filter((l) => String(l.name ?? '').toLowerCase().includes(q))
  }, [activeLagers, sidebarQuery])

  const selectedLager = useMemo(
    () => lagers.find((l) => l.id === selectedLagerId) ?? null,
    [lagers, selectedLagerId]
  )

  useEffect(() => {
    if (activeTab !== 'lager') return
    if (filteredSidebarLagers.length === 0) {
      setSelectedLagerId(null)
      return
    }
    if (!selectedLagerId || !filteredSidebarLagers.some((l) => l.id === selectedLagerId)) {
      setSelectedLagerId(filteredSidebarLagers[0].id)
    }
  }, [activeTab, filteredSidebarLagers, selectedLagerId])

  useEffect(() => {
    if (!selectedLager) {
      setLagerNameDraft('')
      setLagerDescDraft('')
      return
    }
    setLagerNameDraft(String(selectedLager.name ?? ''))
    setLagerDescDraft(String(selectedLager.beschreibung ?? ''))
  }, [selectedLager?.id, selectedLager?.name, selectedLager?.beschreibung])

  const lagerDirty =
    selectedLager &&
    (lagerNameDraft.trim() !== String(selectedLager.name ?? '').trim() ||
      lagerDescDraft.trim() !== String(selectedLager.beschreibung ?? '').trim())

  const firmDirty =
    standort &&
    (firmenname.trim() !== String(standort.name ?? '').trim() ||
      anschrift.trim() !== String(standort.anschrift ?? '').trim() ||
      logoFile != null)

  const showFeedback = (type, text) => setFeedback({ type, text })

  const pickStandort = (id) => {
    setStandortId(id)
    setTenantMenuOpen(false)
    setSelectedLagerId(null)
    try {
      sessionStorage.setItem(STANDORT_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }

  const createStandort = async (opts) => {
    const nameArg = typeof opts === 'string' ? opts : opts?.name
    const linkTenantWhenAccountHasNone =
      typeof opts === 'object' && opts != null && opts.linkTenantWhenAccountHasNone === true
    const m = pb.authStore.model
    if (readOnly || !recordPbAdmin(m)) return
    const nm = String(nameArg ?? '').trim() || 'Neues Unternehmen'
    setBusy(true)
    try {
      const r = await pb.collection(PB_COLLECTIONS.standorte).create(
        {
          name: nm,
          anschrift: '',
        },
        { requestKey: null }
      )
      if (linkTenantWhenAccountHasNone && m?.id && !userTenantRelationId(m)) {
        try {
          await pb.collection(PB_COLLECTIONS.users).update(m.id, { tenant_id: r.id }, { requestKey: null })
          await pb.collection(PB_COLLECTIONS.users).authRefresh({ requestKey: null })
        } catch {
          /* Standort existiert; Mandant am Konto ggf. manuell setzen */
        }
      }
      const list = await pb.collection(PB_COLLECTIONS.standorte).getFullList({ sort: 'name', requestKey: null })
      setStandorteList(list)
      pickStandort(r.id)
      showFeedback('ok', 'Unternehmen angelegt.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Anlegen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const saveStandort = async (e) => {
    e?.preventDefault?.()
    if (readOnly || !standortId) return
    setBusy(true)
    setFeedback({ type: '', text: '' })
    try {
      const fd = new FormData()
      fd.set('name', firmenname.trim() || 'Unternehmen')
      fd.set('anschrift', anschrift.trim())
      if (logoFile) fd.set('logo', logoFile)
      await pb.collection(PB_COLLECTIONS.standorte).update(standortId, fd)
      setLogoFile(null)
      const rec = await pb.collection(PB_COLLECTIONS.standorte).getOne(standortId, { requestKey: null })
      setStandort(rec)
      setFirmenname(String(rec.name ?? ''))
      setAnschrift(String(rec.anschrift ?? ''))
      const list = await pb.collection(PB_COLLECTIONS.standorte).getFullList({ sort: 'name', requestKey: null })
      setStandorteList(list)
      showFeedback('ok', 'Unternehmensdaten gespeichert.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const discardFirma = () => {
    if (!standort) return
    setFirmenname(String(standort.name ?? ''))
    setAnschrift(String(standort.anschrift ?? ''))
    setLogoFile(null)
  }

  const addLager = async () => {
    const n = newLagerName.trim()
    if (readOnly || !standortId || !n) return
    setBusy(true)
    try {
      const created = await pb.collection(PB_COLLECTIONS.lager).create({
        standort: standortId,
        name: n,
        sort_index: activeLagers.length,
        aktiv: true,
        beschreibung: '',
      })
      setNewLagerName('')
      await loadLagers(standortId)
      setSelectedLagerId(created.id)
      setActiveTab('lager')
      showFeedback('ok', 'Lager angelegt.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Lager konnte nicht angelegt werden.')
    } finally {
      setBusy(false)
    }
  }

  const saveLager = async () => {
    if (readOnly || !selectedLagerId || !selectedLager) return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.lager).update(selectedLagerId, {
        name: lagerNameDraft.trim() || selectedLager.name,
        beschreibung: lagerDescDraft.trim(),
      })
      await loadLagers(standortId)
      showFeedback('ok', 'Lager gespeichert.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const discardLager = () => {
    if (!selectedLager) return
    setLagerNameDraft(String(selectedLager.name ?? ''))
    setLagerDescDraft(String(selectedLager.beschreibung ?? ''))
  }

  const archiveLager = async () => {
    if (readOnly || !selectedLagerId) return
    if (!window.confirm('Lager archivieren? Es wird in der Liste ausgeblendet und kann später wiederhergestellt werden.'))
      return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.lager).update(selectedLagerId, { aktiv: false })
      await loadLagers(standortId)
      setSelectedLagerId(null)
      showFeedback('ok', 'Lager archiviert.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Archivieren fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const restoreLager = async (id) => {
    if (readOnly) return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.lager).update(id, { aktiv: true })
      await loadLagers(standortId)
      showFeedback('ok', 'Lager wiederhergestellt.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Wiederherstellen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const deleteLagerHard = async (id) => {
    if (readOnly) return
    const n = artikelByLager[id] ?? 0
    const msg =
      n > 0
        ? `Dieses Lager ist mit ${n} Artikel(n) verknüpft. Trotzdem endgültig löschen? Unterlager und Zuordnungen können ebenfalls betroffen sein.`
        : 'Lager mit allen Unterlagern endgültig löschen?'
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.lager).delete(id)
      await loadLagers(standortId)
      if (selectedLagerId === id) setSelectedLagerId(null)
      showFeedback('ok', 'Lager gelöscht.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Löschen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const addUnterlager = async (lagerId) => {
    const n = (newUnter[lagerId] || '').trim()
    if (readOnly || !n) return
    setBusy(true)
    try {
      const list = unterByLager[lagerId] || []
      await pb.collection(PB_COLLECTIONS.unterlager).create({
        lager: lagerId,
        name: n,
        sort_index: list.length,
        aktiv: true,
      })
      setNewUnter((prev) => ({ ...prev, [lagerId]: '' }))
      await loadLagers(standortId)
      showFeedback('ok', 'Unterlager angelegt.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Unterlager konnte nicht angelegt werden.')
    } finally {
      setBusy(false)
    }
  }

  const removeUnterlager = async (id) => {
    if (readOnly || !window.confirm('Unterlager löschen?')) return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.unterlager).delete(id)
      await loadLagers(standortId)
      showFeedback('ok', 'Unterlager gelöscht.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Löschen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const addAssignment = async () => {
    if (!assignUserId || !selectedLagerId) return
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.userLager).create({
        nutzer: assignUserId,
        lager: selectedLagerId,
      })
      setAssignUserId('')
      await loadAssignments()
      showFeedback('ok', 'Zuweisung gespeichert.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Zuweisung fehlgeschlagen (evtl. schon vorhanden).')
    } finally {
      setBusy(false)
    }
  }

  const removeAssignment = async (id) => {
    setBusy(true)
    try {
      await pb.collection(PB_COLLECTIONS.userUnterlager).delete(id)
      await loadAssignments()
      showFeedback('ok', 'Zuweisung entfernt.')
    } catch (err) {
      showFeedback('error', pocketBaseFullErrorMessage(err) || 'Löschen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const logoUrl =
    standort && standort.logo
      ? pb.files.getURL(standort, Array.isArray(standort.logo) ? standort.logo[0] : standort.logo)
      : null

  const currentStandortName = standort?.name || standorteList.find((s) => s.id === standortId)?.name || 'Unternehmen'

  if (!standortId && !standorteInitDone) {
    return (
      <section className="rounded-md border border-border bg-background p-6" aria-busy="true" aria-labelledby="lagerverwaltung-boot-title">
        <h2 id="lagerverwaltung-boot-title" className="text-lg font-semibold text-foreground">
          Lagerverwaltung
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Mandanten werden geladen …</p>
      </section>
    )
  }

  if (!standortId) {
    const m = pb.authStore.model ?? undefined
    const pbAdmin = recordPbAdmin(m)
    return (
      <section className="rounded-md border border-border bg-background p-6" aria-labelledby="lagerverwaltung-empty-title">
        <h2 id="lagerverwaltung-empty-title" className="text-lg font-semibold text-foreground">
          Lagerverwaltung
        </h2>
        {pbAdmin && !readOnly ? (
          <div className="mt-3 space-y-3">
            {feedback.text ? (
              <p
                className={cn(
                  'rounded-md border px-3 py-2 text-[12.5px]',
                  feedback.type === 'error'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-border bg-muted/50 text-foreground'
                )}
                role={feedback.type === 'error' ? 'alert' : 'status'}
              >
                {feedback.text}
              </p>
            ) : null}
            <div className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="Name des Unternehmens / Standorts"
                value={bootstrapStandortName}
                disabled={busy}
                onChange={(e) => setBootstrapStandortName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void createStandort({ name: bootstrapStandortName, linkTenantWhenAccountHasNone: true })
                }}
              />
              <button
                type="button"
                disabled={busy || !bootstrapStandortName.trim()}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                onClick={() => void createStandort({ name: bootstrapStandortName, linkTenantWhenAccountHasNone: true })}
              >
                Unternehmen anlegen
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Kein Mandant (Standort) am Benutzerkonto. Bitte in PocketBase ein{' '}
            <code className="rounded bg-muted px-1 text-xs">tenant_id</code> setzen oder als Administrator:in einen
            Standort anlegen lassen — wer die Rolle <code className="rounded bg-muted px-1 text-xs">admin</code> hat,
            kann in der Lagerverwaltung beim ersten Einrichten einen Standort erstellen (sofern Schreibzugriff
            aktiv ist).
          </p>
        )}
      </section>
    )
  }

  const unterCount = (lid) => (unterByLager[lid] || []).length
  const artikelCount = (lid) => artikelByLager[lid] ?? 0

  const workspaceListTitle =
    activeTab === 'lager'
      ? 'Lager & Unterlager'
      : activeTab === 'firma'
        ? 'Unternehmensdaten'
        : 'Archivierte Lager'
  const workspaceListMeta =
    activeTab === 'lager'
      ? `${filteredSidebarLagers.length} Lager`
      : activeTab === 'firma'
        ? currentStandortName
        : `${archivedLagers.length} archiviert`

  const lagerDrawerOpen = Boolean(selectedLagerId)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="lagerverwaltung-page-h1">
      {feedback.text ? (
        <p
          className={cn(
            'mx-3 mt-2 shrink-0 rounded-md border px-3 py-2 text-[12.5px]',
            feedback.type === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-border bg-muted/50 text-foreground'
          )}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3 gap-2">
        <span id="lagerverwaltung-page-h1" className="text-sm font-semibold text-foreground">
          Lagerverwaltung
        </span>
        <div className="relative flex shrink-0 items-center gap-2" ref={tenantMenuRef}>
          <button
            type="button"
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[12.5px] font-medium text-foreground',
              'hover:bg-muted'
            )}
            aria-expanded={tenantMenuOpen}
            onClick={() => setTenantMenuOpen((o) => !o)}
          >
            <span className="max-w-[12rem] truncate sm:max-w-[14rem]">{currentStandortName}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </button>
          {tenantMenuOpen ? (
            <div
              className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-md border border-border bg-background py-1 shadow-md"
              role="menu"
            >
              {standorteList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'block w-full px-3 py-2 text-left text-[12.5px] hover:bg-muted',
                    s.id === standortId && 'bg-muted/60'
                  )}
                  onClick={() => pickStandort(s.id)}
                >
                  {s.name || s.id}
                </button>
              ))}
              {recordPbAdmin(pb.authStore.model ?? undefined) && !readOnly ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full border-t border-border px-3 py-2 text-left text-[12.5px] font-medium text-primary hover:bg-muted"
                  onClick={() => {
                    setTenantMenuOpen(false)
                    void createStandort()
                  }}
                >
                  Weiteres anlegen
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="shrink-0 border-b border-border px-3 py-2">

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bereiche">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lager'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12.5px] transition-colors',
                activeTab === 'lager'
                  ? 'border-border bg-muted font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setActiveTab('lager')}
            >
              <Warehouse className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Lager
              <span className="tabular-nums text-xs text-muted-foreground">{filteredSidebarLagers.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'firma'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12.5px] transition-colors',
                activeTab === 'firma'
                  ? 'border-border bg-muted font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setActiveTab('firma')}
            >
              <Settings className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Unternehmen
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'archiv'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12.5px] transition-colors',
                activeTab === 'archiv'
                  ? 'border-border bg-muted font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setActiveTab('archiv')}
            >
              <Box className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Archiv
              <span className="tabular-nums text-xs text-muted-foreground">{archivedLagers.length}</span>
            </button>
          </div>
        </header>

        {activeTab === 'lager' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <input
                  type="search"
                  value={sidebarQuery}
                  onChange={(e) => setSidebarQuery(e.target.value)}
                  placeholder="Lager suchen…"
                  className={cn(
                    'h-8 min-w-[10rem] max-w-md flex-1 rounded-md border border-border bg-background px-2 text-[12.5px]',
                    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  aria-label="Lager suchen"
                />
                {readOnly ? null : (
                  <>
                    <input
                      ref={newLagerInputRef}
                      id="lv-toolbar-new-lager"
                      type="text"
                      value={newLagerName}
                      onChange={(e) => setNewLagerName(e.target.value)}
                      placeholder="Neues Lager…"
                      disabled={busy}
                      className={cn(
                        'h-8 min-w-[8rem] max-w-xs flex-1 rounded-md border border-dashed border-border bg-background px-2 text-[12.5px]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void addLager()
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = newLagerName.trim()
                        if (n) void addLager()
                        else newLagerInputRef.current?.focus()
                      }}
                      disabled={busy}
                      title="Neues Lager anlegen"
                      className={cn(
                        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
                        'hover:opacity-90 disabled:opacity-50'
                      )}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-background" role="region" aria-label="Lagerliste">
                <div
                  className={cn(
                    'sticky top-0 z-10 border-b border-border bg-background px-3 py-1.5',
                    'text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground'
                  )}
                >
                  <span>Lager</span>
                </div>
                {filteredSidebarLagers.length === 0 ? (
                  <p className="p-8 text-center text-[12.5px] text-muted-foreground">Keine Lager.</p>
                ) : (
                  <ul>
                    {filteredSidebarLagers.map((l) => {
                      const active = l.id === selectedLagerId
                      const uc = unterCount(l.id)
                      const ac = artikelCount(l.id)
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedLagerId(l.id)}
                            className={cn(
                              'flex w-full items-center border-b border-border px-3 py-1 text-left text-[12.5px] transition-colors',
                              active
                                ? 'border-l-2 border-l-primary bg-muted'
                                : 'border-l-2 border-l-transparent hover:bg-muted/50'
                            )}
                          >
                            <span className="min-w-0 truncate font-medium text-foreground">{l.name}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* MITTLERE SPALTE: Verwaltung */}
            <div
              className={cn(
                'flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-border bg-background',
                'max-[1180px]:fixed max-[1180px]:inset-y-0 max-[1180px]:right-0 max-[1180px]:z-40 max-[1180px]:shadow-xl',
                !lagerDrawerOpen && 'max-[1180px]:hidden'
              )}
              aria-label="Lager-Verwaltung"
              aria-hidden={!lagerDrawerOpen}
            >
              {!selectedLager ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted-foreground">
                  Wähle ein Lager aus der Liste.
                </div>
              ) : (
                <>
                  <header className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-1.5">
                    <input
                      className="w-full truncate rounded border border-transparent bg-transparent px-1 text-sm font-semibold text-foreground
                        hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      value={lagerNameDraft}
                      onChange={(e) => setLagerNameDraft(e.target.value)}
                      onBlur={() => void saveLager()}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                      disabled={readOnly || busy}
                      aria-label="Lagername"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {unterCount(selectedLager.id)} U-Lager · {lagerArticles.length} Artikel
                    </p>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="space-y-3 p-3">
                    {canAssignUsers ? (
                      <div className="space-y-2">
                        <div className="flex gap-1.5">
                          <select
                            value={assignUserId}
                            onChange={(e) => setAssignUserId(e.target.value)}
                            disabled={busy}
                            className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-[11.5px]"
                            aria-label="Nutzer"
                          >
                            <option value="">Nutzer hinzufügen …</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {displayUserName(u)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void addAssignment()}
                            disabled={busy}
                            className={cn(
                              'inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground',
                              'hover:opacity-90 disabled:opacity-50'
                            )}
                          >
                            Hinzufügen
                          </button>
                        </div>
                        {assignments.filter((r) => r.lager === selectedLagerId || r.expand?.lager?.id === selectedLagerId).length > 0 ? (
                          <div className="overflow-hidden rounded-md border border-border">
                            <ul className="divide-y divide-border">
                              {assignments
                                .filter((r) => r.lager === selectedLagerId || r.expand?.lager?.id === selectedLagerId)
                                .map((row) => {
                                const em = row.expand?.nutzer ? displayUserName(row.expand.nutzer) : row.nutzer
                                return (
                                  <li
                                    key={row.id}
                                    className="px-2.5 py-1.5 text-[12px] text-foreground"
                                  >
                                    {em}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Unterlager
                      </h3>
                      {(unterByLager[selectedLager.id] || []).length > 0 ? (
                        <div className="overflow-hidden rounded-md border border-border">
                          <ul className="divide-y divide-border">
                            {(unterByLager[selectedLager.id] || []).map((u) => (
                              <li
                                key={u.id}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                              >
                                <span className="min-w-0 flex-1 text-[12px] font-medium text-foreground">{u.name}</span>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled
                                    title="Bearbeitung folgt"
                                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-40"
                                  >
                                    <Pencil className="h-2.5 w-2.5" aria-hidden />
                                  </button>
                                  {readOnly ? null : (
                                    <button
                                      type="button"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                                      onClick={() => void removeUnterlager(u.id)}
                                      disabled={busy}
                                      aria-label="Unterlager entfernen"
                                    >
                                      <X className="h-2.5 w-2.5" aria-hidden />
                                    </button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {readOnly ? null : (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newUnter[selectedLager.id] ?? ''}
                            onChange={(e) =>
                              setNewUnter((prev) => ({ ...prev, [selectedLager.id]: e.target.value }))
                            }
                            placeholder="Neues Unterlager …"
                            disabled={busy}
                            className={cn(
                              'h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11.5px]',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => void addUnterlager(selectedLager.id)}
                            disabled={busy}
                            className={cn(
                              'inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground',
                              'hover:opacity-90 disabled:opacity-50'
                            )}
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                            Hinzufügen
                          </button>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>

                  {readOnly ? null : (
                    <footer className="mt-auto flex shrink-0 flex-col gap-1 border-t border-border px-2.5 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void deleteLagerHard(selectedLager.id)}
                          disabled={busy}
                          className="h-7 flex-1 rounded px-2 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Löschen
                        </button>
                        <button
                          type="button"
                          onClick={() => void archiveLager()}
                          disabled={busy}
                          className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Archivieren
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void saveLager()}
                        disabled={busy || !lagerDirty}
                        className={cn(
                          'inline-flex h-7 w-full items-center justify-center gap-0.5 rounded bg-primary text-[11px] font-medium text-primary-foreground',
                          'hover:opacity-90 disabled:opacity-50'
                        )}
                      >
                        <Check className="h-3 w-3" aria-hidden />
                        Speichern
                      </button>
                    </footer>
                  )}
                </>
              )}
            </div>

            {/* RECHTE SPALTE: Artikel */}
            <div className={cn(
              'flex h-full min-h-0 w-[340px] shrink-0 flex-col border-l border-border bg-background',
              'max-[1180px]:hidden'
            )}
              aria-label="Artikel"
            >
              {!selectedLager ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted-foreground">
                  Wähle ein Lager aus der Liste.
                </div>
              ) : (
                <>
                  <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                      Artikel ({lagerArticles.length})
                    </p>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {lagerArticlesBusy ? (
                      <p className="p-2 text-[12px] text-muted-foreground">Lädt…</p>
                    ) : lagerArticles.length === 0 ? (
                      <p className="p-2 text-[12px] text-muted-foreground">Keine Artikel.</p>
                    ) : (
                      <ul className="divide-y divide-border text-[12px]">
                        {lagerArticles.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1">
                            <span className="min-w-0 truncate font-medium text-[12px]">{a.name}</span>
                            <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                              {a.einheit} · {Number(a.preis).toFixed(2)}€
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

      {activeTab === 'firma' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mx-auto w-full max-w-[720px] rounded-md border border-border bg-background p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="text-[12.5px] text-muted-foreground">
                  Erscheint auf PDF-Exporten und in der Druckansicht.
                </p>
              </div>
              {recordPbAdmin(pb.authStore.model ?? undefined) && !readOnly ? (
                <button
                  type="button"
                  onClick={() => void createStandort()}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Weiteres Unternehmen
                </button>
              ) : null}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void saveStandort(e)
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-[140px_1fr] items-center gap-x-3 gap-y-3">
                <label htmlFor="lv-firma-name" className="text-[12.5px] text-muted-foreground">
                  Name
                </label>
                <input
                  id="lv-firma-name"
                  value={firmenname}
                  onChange={(e) => setFirmenname(e.target.value)}
                  disabled={readOnly || busy}
                  className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px]"
                />
                <label htmlFor="lv-firma-adr" className="self-start pt-2 text-[12.5px] text-muted-foreground">
                  Anschrift
                </label>
                <textarea
                  id="lv-firma-adr"
                  rows={2}
                  value={anschrift}
                  onChange={(e) => setAnschrift(e.target.value)}
                  disabled={readOnly || busy}
                  className="resize-y rounded-md border border-input bg-background px-3 py-2 text-[12.5px]"
                />
                <span className="self-start pt-2 text-[12.5px] text-muted-foreground">Logo</span>
                <div className="flex flex-wrap items-start gap-3">
                  <div
                    className={cn(
                      'flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/50',
                      logoUrl && !logoFile ? 'border-solid' : ''
                    )}
                  >
                    {logoUrl && !logoFile ? (
                      <img src={logoUrl} alt="" className="h-full w-full rounded-md object-contain" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Logo</span>
                    )}
                  </div>
                  <div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-[12.5px] hover:bg-muted">
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      Datei wählen
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={readOnly || busy}
                        onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">PNG / JPG / SVG · max. 2 MB</p>
                    <p className="text-[10px] text-muted-foreground">
                      (Upload: JPG/PNG/WebP/GIF laut PocketBase-Regel)
                    </p>
                  </div>
                </div>
              </div>
              {readOnly ? null : (
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  {firmDirty ? (
                    <span className="mr-auto self-center text-[12px] text-muted-foreground">
                      Nicht gespeicherte Änderungen
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={discardFirma}
                    disabled={busy || !firmDirty}
                    className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] hover:bg-muted disabled:opacity-50"
                  >
                    Verwerfen
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !firmDirty}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Speichern
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      ) : null}

      {activeTab === 'archiv' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-md border border-border bg-background">
            <div className="border-b border-border px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Archivierte Lager</p>
            </div>
            {archivedLagers.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">Keine archivierten Lager.</p>
            ) : (
              <ul>
                {archivedLagers.map((l, idx) => (
                  <li
                    key={l.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                      idx < archivedLagers.length - 1 && 'border-b border-border'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-foreground">{l.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {String(l.beschreibung ?? '').trim() || 'Keine Beschreibung'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {readOnly ? null : (
                        <>
                          <button
                            type="button"
                            onClick={() => void restoreLager(l.id)}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-[12.5px] hover:bg-muted"
                          >
                            <History className="h-3.5 w-3.5" aria-hidden />
                            Wiederherstellen
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteLagerHard(l.id)}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[12.5px] text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Endgültig löschen
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
    </section>
  )
}
