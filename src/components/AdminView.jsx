import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Cog, FileSpreadsheet } from 'lucide-react'
import { parseArtikelExcelBuffer } from '../lib/excelArtikelImport'
import { pb, mapPbRecordToUser } from '../lib/pocketbase'
import {
  fetchLagerOptionsForZaehlenFilter,
  fetchUnterlagerOptionsForZaehlen,
} from '../lib/lagerAccess'

const FALLBACK_EINHEITEN = ['Stk', 'l', 'kg', 'g', 'Kiste']

function parsePreisInput(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function draftFromItem(item) {
  return {
    artikelnummer: String(item.artikelnummer ?? ''),
    name: String(item.name ?? ''),
    preisInput:
      typeof item.preis === 'number' && Number.isFinite(item.preis)
        ? item.preis.toFixed(2).replace('.', ',')
        : '',
    einheit: String(item.einheit ?? '').trim() || 'Stk',
    category: String(item.category ?? ''),
    lagerId: String(item.lagerId ?? '').trim(),
    unterlagerId: String(item.unterlagerId ?? '').trim(),
  }
}

/** Entwurf weicht vom gespeicherten Artikel ab (Speichern anzeigen). */
function isRowDraftDirty(item, draft) {
  if (!draft) return false
  const base = draftFromItem(item)
  if (base.artikelnummer.trim() !== draft.artikelnummer.trim()) return true
  if (base.name.trim() !== draft.name.trim()) return true
  if (base.einheit.trim() !== draft.einheit.trim()) return true
  if (base.category.trim() !== draft.category.trim()) return true
  if (String(base.lagerId ?? '').trim() !== String(draft.lagerId ?? '').trim()) return true
  if (String(base.unterlagerId ?? '').trim() !== String(draft.unterlagerId ?? '').trim()) return true
  const pb = parsePreisInput(base.preisInput)
  const pd = parsePreisInput(draft.preisInput)
  if (Number.isFinite(pb) && Number.isFinite(pd)) {
    return Math.round(pb * 100) !== Math.round(pd * 100)
  }
  return base.preisInput.trim() !== draft.preisInput.trim()
}

function AdminView({
  categories,
  items,
  readOnlyMagazin = false,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onCreateArtikel,
  onBulkImportArtikel,
  onUpdateArtikel,
  onArchiveArtikel,
  onDeleteArtikel,
}) {
  const canMutate = !readOnlyMagazin
  const [newCategoryName, setNewCategoryName] = useState('')
  const [renameFrom, setRenameFrom] = useState(null)
  const [renameTo, setRenameTo] = useState('')
  const [categoryActionBusy, setCategoryActionBusy] = useState(false)
  const [chipCategoryMenuOpen, setChipCategoryMenuOpen] = useState(null)
  const [magazinQuickAddOpen, setMagazinQuickAddOpen] = useState(false)
  const [magazinQuickAddValue, setMagazinQuickAddValue] = useState('')
  const [artikelnummer, setArtikelnummer] = useState('')
  const [name, setName] = useState('')
  const [preisInput, setPreisInput] = useState('')
  const [einheit, setEinheit] = useState('Stk')
  const [category, setCategory] = useState('')
  const [newLagerId, setNewLagerId] = useState('')
  const [newUnterlagerId, setNewUnterlagerId] = useState('')
  const [magazinLagerOptions, setMagazinLagerOptions] = useState([])
  const [magazinUnterlagerOptions, setMagazinUnterlagerOptions] = useState([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filterCategory, setFilterCategory] = useState('Alle')
  /** Entwürfe pro Artikel-ID – immer direkt editierbare Felder */
  const [rowDrafts, setRowDrafts] = useState({})

  useEffect(() => {
    if (!readOnlyMagazin) return
    setShowCreateForm(false)
    setMagazinQuickAddOpen(false)
    setChipCategoryMenuOpen(null)
  }, [readOnlyMagazin])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const u = mapPbRecordToUser(pb.authStore.model)
      if (!u?.id) {
        if (!cancelled) {
          setMagazinLagerOptions([])
          setMagazinUnterlagerOptions([])
        }
        return
      }
      try {
        const [lags, uls] = await Promise.all([
          fetchLagerOptionsForZaehlenFilter(pb, u),
          fetchUnterlagerOptionsForZaehlen(pb, u),
        ])
        if (!cancelled) {
          setMagazinLagerOptions(Array.isArray(lags) ? lags : [])
          setMagazinUnterlagerOptions(Array.isArray(uls) ? uls : [])
        }
      } catch {
        if (!cancelled) {
          setMagazinLagerOptions([])
          setMagazinUnterlagerOptions([])
        }
      }
    }
    void run()
    const unsub = pb.authStore.onChange(() => {
      void run()
    })
    return () => {
      cancelled = true
      if (typeof unsub === 'function') unsub()
    }
  }, [])
  const [savingId, setSavingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [archivingId, setArchivingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [rowActionMenuOpen, setRowActionMenuOpen] = useState(null)
  const [rowActionMenuPos, setRowActionMenuPos] = useState(null)

  const filterTabs = useMemo(() => {
    const set = new Set()
    for (const it of items) {
      set.add(String(it.category || '').trim() || 'Ohne Kategorie')
    }
    for (const c of categories) {
      if (String(c || '').trim()) set.add(String(c).trim())
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
    return ['Alle', ...sorted]
  }, [items, categories])

  const magazinUlsByLagerId = useMemo(() => {
    const m = new Map()
    for (const u of magazinUnterlagerOptions) {
      const raw = u.lager
      let lid = ''
      if (typeof raw === 'string' && raw) lid = raw
      else if (raw && typeof raw === 'object' && raw.id) lid = String(raw.id)
      else if (u.expand?.lager?.id) lid = String(u.expand.lager.id)
      if (!lid) continue
      if (!m.has(lid)) m.set(lid, [])
      m.get(lid).push(u)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const si = (a.sort_index ?? 0) - (b.sort_index ?? 0)
        if (si !== 0) return si
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de')
      })
    }
    return m
  }, [magazinUnterlagerOptions])

  useEffect(() => {
    if (filterCategory !== 'Alle' && !filterTabs.includes(filterCategory)) {
      setFilterCategory('Alle')
    }
  }, [filterTabs, filterCategory])

  useEffect(() => {
    if (chipCategoryMenuOpen == null) return
    const onMouseDown = (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const w = t.closest('[data-admin-cat-menu-chip]')
      if (w?.getAttribute('data-admin-cat-menu-chip') === chipCategoryMenuOpen) return
      setChipCategoryMenuOpen(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setChipCategoryMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [chipCategoryMenuOpen])

  useEffect(() => {
    if (rowActionMenuOpen == null) return
    const onMouseDown = (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const w = t.closest('[data-admin-row-menu]')
      if (w?.getAttribute('data-admin-row-menu') === rowActionMenuOpen) return
      setRowActionMenuOpen(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setRowActionMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [rowActionMenuOpen])

  useEffect(() => {
    setRowDrafts((prev) => {
      const next = { ...prev }
      const itemById = new Map(items.map((i) => [i.id, i]))
      for (const id of Object.keys(next)) {
        if (!itemById.has(id)) delete next[id]
      }
      for (const it of items) {
        if (next[it.id] == null) {
          next[it.id] = draftFromItem(it)
        }
      }
      return next
    })
  }, [items])

  useEffect(() => {
    const valid = new Set(items.map((i) => i.id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const einheitenOptions = useMemo(() => {
    const seen = new Set(FALLBACK_EINHEITEN)
    for (const it of items) {
      const e = String(it.einheit ?? '').trim()
      if (e) seen.add(e)
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
  }, [items])

  const categorySelectOptions = useMemo(() => {
    const s = new Set()
    for (const c of categories) {
      const t = String(c ?? '').trim()
      if (t) s.add(t)
    }
    for (const it of items) {
      const t = String(it.category ?? '').trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
  }, [categories, items])

  const handleAddCategory = (event) => {
    event.preventDefault()
    const t = newCategoryName.trim()
    if (!t) return
    onAddCategory(t)
    setNewCategoryName('')
    setFeedback({ type: 'success', text: `Kategorie „${t}“ für die Inventur-Ansicht ergänzt.` })
  }

  const openRenameCategory = (name) => {
    setRenameFrom(name)
    setRenameTo(name)
    setFeedback({ type: '', text: '' })
  }

  const cancelRenameCategory = () => {
    setRenameFrom(null)
    setRenameTo('')
    setCategoryActionBusy(false)
  }

  const submitRenameCategory = async (event) => {
    event.preventDefault()
    if (!onRenameCategory || renameFrom == null) return
    const from = renameFrom.trim()
    const to = renameTo.trim()
    if (!from || !to) {
      setFeedback({ type: 'error', text: 'Alter und neuer Name dürfen nicht leer sein.' })
      return
    }
    if (from === to) {
      setFeedback({ type: 'error', text: 'Bitte einen anderen neuen Namen eingeben.' })
      return
    }
    const nArtikel = items.filter((i) => String(i.category ?? '').trim() === from).length
    const msgIntro =
      nArtikel > 0
        ? `Kategorie „${from}“ bei ${nArtikel} Artikel(n) in „${to}“ umbenennen und Inventur-Tabs anpassen?`
        : `Inventur-Tab „${from}“ in „${to}“ umbenennen? (Keine Artikel mit dieser Kategorie.)`
    if (!window.confirm(msgIntro)) return

    setCategoryActionBusy(true)
    setFeedback({ type: '', text: '' })
    const res = await onRenameCategory(from, to)
    setCategoryActionBusy(false)

    if (res.ok) {
      setRowDrafts((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          const d = next[id]
          if (d && String(d.category ?? '').trim() === from) {
            next[id] = { ...d, category: to }
          }
        }
        return next
      })
      if (filterCategory === from) setFilterCategory(to)
    } else if (res.updatedIds?.length) {
      setRowDrafts((prev) => {
        const next = { ...prev }
        for (const id of res.updatedIds) {
          const d = next[id]
          if (d) next[id] = { ...d, category: to }
        }
        return next
      })
      if (filterCategory === from) setFilterCategory(to)
    }

    if (res.ok) {
      setRenameFrom(null)
      setRenameTo('')
      const u = res.updated ?? 0
      setFeedback({
        type: 'success',
        text:
          u > 0
            ? `Kategorie umbenannt: ${u} Artikel in „${to}“ aktualisiert.`
            : `Kategorie für die Inventur in „${to}“ geändert.`,
      })
    } else if (res.updatedIds?.length) {
      setRenameFrom(null)
      setRenameTo('')
      setFeedback({
        type: 'error',
        text: res.message || 'Teilweise fehlgeschlagen.',
      })
    } else {
      setFeedback({
        type: 'error',
        text: res.message || 'Umbenennen fehlgeschlagen.',
      })
    }
  }

  const handleCategoryDelete = async (cat) => {
    setChipCategoryMenuOpen(null)
    if (!onDeleteCategory) return
    const c = String(cat ?? '').trim()
    if (!c) return
    const n = items.filter((i) => String(i.category ?? '').trim() === c).length
    const msg =
      n > 0
        ? `Kategorie „${c}“ wirklich löschen? Bei ${n} Artikel(n) wird die Kategorie entfernt (ohne Kategorie).`
        : `Inventur-Tab „${c}“ entfernen?`
    if (!window.confirm(msg)) return

    setCategoryActionBusy(true)
    setFeedback({ type: '', text: '' })
    const res = await onDeleteCategory(c)
    setCategoryActionBusy(false)

    if (res.ok) {
      setRowDrafts((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          const d = next[id]
          if (d && String(d.category ?? '').trim() === c) {
            next[id] = { ...d, category: '' }
          }
        }
        return next
      })
      if (filterCategory === c) setFilterCategory('Alle')
    } else if (res.updatedIds?.length) {
      setRowDrafts((prev) => {
        const next = { ...prev }
        for (const id of res.updatedIds) {
          const d = next[id]
          if (d) next[id] = { ...d, category: '' }
        }
        return next
      })
      if (filterCategory === c) setFilterCategory('Alle')
    }

    if (res.ok) {
      const u = res.updated ?? 0
      setFeedback({
        type: 'success',
        text:
          u > 0
            ? `Kategorie entfernt: ${u} Artikel ohne Kategorie gespeichert.`
            : 'Kategorie-Tab entfernt.',
      })
    } else if (res.updatedIds?.length) {
      setFeedback({
        type: 'error',
        text: res.message || 'Teilweise fehlgeschlagen.',
      })
    } else {
      setFeedback({
        type: 'error',
        text: res.message || 'Löschen fehlgeschlagen.',
      })
    }
  }

  const handleCreateArtikel = async (event) => {
    event.preventDefault()
    setFeedback({ type: '', text: '' })
    const nr = artikelnummer.trim()
    const nm = name.trim()
    if (!nr || !nm) {
      setFeedback({ type: 'error', text: 'Artikelnummer und Name sind Pflichtfelder.' })
      return
    }
    const preis = parsePreisInput(preisInput)
    if (!Number.isFinite(preis) || preis < 0) {
      setFeedback({ type: 'error', text: 'Bitte einen gültigen Preis eingeben (z. B. 1,99).' })
      return
    }
    const ein = einheit.trim() || 'Stk'
    setBusy(true)
    const result = await onCreateArtikel({
      artikelnummer: nr,
      name: nm,
      preis,
      einheit: ein,
      category: category.trim(),
      lagerId: newLagerId.trim(),
      unterlagerId: newUnterlagerId.trim(),
    })
    setBusy(false)
    if (result.ok) {
      setArtikelnummer('')
      setName('')
      setPreisInput('')
      setEinheit('Stk')
      setCategory('')
      setNewLagerId('')
      setNewUnterlagerId('')
      setShowCreateForm(false)
      setFeedback({ type: 'success', text: 'Artikel in PocketBase gespeichert.' })
    } else {
      setFeedback({
        type: 'error',
        text: result.message || 'Anlegen fehlgeschlagen.',
      })
    }
  }

  const handleExcelFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onBulkImportArtikel) return
    setFeedback({ type: '', text: '' })
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseArtikelExcelBuffer(buf)
      if (!parsed.ok) {
        setFeedback({ type: 'error', text: parsed.error || 'Import nicht möglich.' })
        return
      }
      setBusy(true)
      try {
        const { created, updated = 0, failed, skipped } = await onBulkImportArtikel(parsed.rows)
        const sheetHint = parsed.sourceSheet ? `Blatt „${parsed.sourceSheet}“. ` : ''
        const parts = [`${sheetHint}${created} Artikel angelegt.`]
        if (updated > 0) parts.push(`${updated} aktualisiert.`)
        if (skipped.length) parts.push(`${skipped.length} übersprungen.`)
        if (failed.length) parts.push(`${failed.length} mit Fehler.`)
        const allIssues = [...skipped, ...failed]
        const detailLines = allIssues.slice(0, 5).map((x) => `Zeile ${x.line}: ${x.message}`)
        const detail = detailLines.length ? `\n${detailLines.join('\n')}` : ''
        const moreN = allIssues.length - 5
        const more = moreN > 0 ? `\n… und ${moreN} weitere` : ''
        const fullText = `${parts.join(' ')}${detail}${more}`
        const onlyFailures =
          failed.length > 0 && created === 0 && updated === 0 && skipped.length === 0
        setFeedback({
          type: onlyFailures ? 'error' : 'success',
          text: fullText,
        })
      } finally {
        setBusy(false)
      }
    } catch (e) {
      setFeedback({
        type: 'error',
        text: e?.message || 'Datei konnte nicht gelesen werden.',
      })
    }
  }

  const patchRowDraft = (id, patch) => {
    setRowDrafts((prev) => {
      const item = items.find((i) => i.id === id)
      const cur = prev[id] ?? (item ? draftFromItem(item) : null)
      if (!cur) return prev
      return { ...prev, [id]: { ...cur, ...patch } }
    })
  }

  const saveRowDraft = async (id) => {
    const draft = rowDrafts[id]
    if (!onUpdateArtikel || !draft) return
    const nr = draft.artikelnummer.trim()
    const nm = draft.name.trim()
    if (!nr || !nm) {
      setFeedback({ type: 'error', text: 'Artikelnummer und Name sind Pflichtfelder.' })
      return
    }
    const preis = parsePreisInput(draft.preisInput)
    if (!Number.isFinite(preis) || preis < 0) {
      setFeedback({ type: 'error', text: 'Bitte einen gültigen Preis eingeben (z. B. 1,99).' })
      return
    }
    if (!window.confirm('Änderungen an diesem Artikel in PocketBase speichern?')) return
    setSavingId(id)
    setFeedback({ type: '', text: '' })
    try {
      const res = await onUpdateArtikel({
        id,
        artikelnummer: nr,
        name: nm,
        preis,
        einheit: draft.einheit.trim() || 'Stk',
        category: draft.category.trim(),
        lagerId: String(draft.lagerId ?? '').trim(),
        unterlagerId: String(draft.unterlagerId ?? '').trim(),
      })
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Artikel gespeichert.' })
      } else {
        setFeedback({ type: 'error', text: res.message || 'Speichern fehlgeschlagen.' })
      }
    } catch (e) {
      setFeedback({
        type: 'error',
        text: e?.message || 'Speichern fehlgeschlagen.',
      })
    } finally {
      setSavingId(null)
    }
  }

  const archiveRowArtikel = async (item) => {
    if (!item?.id || !onArchiveArtikel) return
    setRowActionMenuOpen(null)
    const label = String(item.name || item.artikelnummer || 'diesen Artikel')
    const ok = window.confirm(`Artikel „${label}“ archivieren?\n\nArchivierte Artikel werden in den Ansichten ausgeblendet.`)
    if (!ok) return
    setFeedback({ type: '', text: '' })
    setArchivingId(item.id)
    try {
      const res = await onArchiveArtikel(item.id)
      if (res?.ok) {
        setSelectedIds((prev) => {
          if (!prev.has(item.id)) return prev
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
        setFeedback({ type: 'success', text: `Artikel „${label}“ archiviert.` })
      } else {
        setFeedback({
          type: 'error',
          text: res?.message || 'Artikel konnte nicht archiviert werden.',
        })
      }
    } finally {
      setArchivingId(null)
    }
  }

  const deleteRowArtikel = async (item) => {
    if (!item?.id || !onDeleteArtikel) return
    setRowActionMenuOpen(null)
    const label = String(item.name || item.artikelnummer || 'diesen Artikel')
    const ok = window.confirm(`Artikel „${label}“ wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`)
    if (!ok) return
    setFeedback({ type: '', text: '' })
    setDeletingId(item.id)
    try {
      const res = await onDeleteArtikel(item.id)
      if (res?.ok) {
        setSelectedIds((prev) => {
          if (!prev.has(item.id)) return prev
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
        setFeedback({ type: 'success', text: `Artikel „${label}“ gelöscht.` })
      } else {
        setFeedback({
          type: 'error',
          text: res?.message || 'Artikel konnte nicht gelöscht werden.',
        })
      }
    } finally {
      setDeletingId(null)
    }
  }

  const toggleRowSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroupSelected = (groupRows) => {
    const ids = groupRows.map((r) => r.id)
    setSelectedIds((prev) => {
      const allOn = ids.length > 0 && ids.every((iid) => prev.has(iid))
      const next = new Set(prev)
      if (allOn) ids.forEach((iid) => next.delete(iid))
      else ids.forEach((iid) => next.add(iid))
      return next
    })
  }

  const applyBulkCategoryDraft = () => {
    if (selectedIds.size === 0) return
    const nSel = selectedIds.size
    const ids = [...selectedIds]
    const v = bulkCategory
    setRowDrafts((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        const item = items.find((i) => i.id === id)
        const cur = next[id] ?? (item ? draftFromItem(item) : null)
        if (!cur) continue
        next[id] = { ...cur, category: v }
      }
      return next
    })
    const t = String(v ?? '').trim()
    if (t) onAddCategory(t)
    setFeedback({ type: 'success', text: `Kategorie im Entwurf für ${nSel} Artikel gesetzt.` })
  }

  const bulkSaveSelected = async () => {
    if (!onUpdateArtikel || selectedIds.size === 0) return
    const ids = [...selectedIds]
    const payloads = []
    for (const id of ids) {
      const item = items.find((i) => i.id === id)
      const d = rowDrafts[id] ?? (item ? draftFromItem(item) : null)
      if (!d || !item) continue
      const nr = d.artikelnummer.trim()
      const nm = d.name.trim()
      if (!nr || !nm) {
        setFeedback({
          type: 'error',
          text: 'Artikelnummer und Name sind bei allen Ausgewählten Pflichtfelder.',
        })
        return
      }
      const preis = parsePreisInput(d.preisInput)
      if (!Number.isFinite(preis) || preis < 0) {
        setFeedback({
          type: 'error',
          text: 'Bitte bei allen Ausgewählten einen gültigen Preis prüfen.',
        })
        return
      }
      payloads.push({ id, d })
    }
    if (payloads.length === 0) return
    if (!window.confirm(`${payloads.length} ausgewählte Artikel in PocketBase speichern?`)) return
    setBulkSaving(true)
    setFeedback({ type: '', text: '' })
    let ok = 0
    let fail = 0
    for (const { id, d } of payloads) {
      try {
        const res = await onUpdateArtikel({
          id,
          artikelnummer: d.artikelnummer.trim(),
          name: d.name.trim(),
          preis: parsePreisInput(d.preisInput),
          einheit: d.einheit.trim() || 'Stk',
          category: d.category.trim(),
          lagerId: String(d.lagerId ?? '').trim(),
          unterlagerId: String(d.unterlagerId ?? '').trim(),
        })
        if (res.ok) ok += 1
        else fail += 1
      } catch {
        fail += 1
      }
    }
    setBulkSaving(false)
    if (fail === 0) {
      setFeedback({ type: 'success', text: `${ok} Artikel gespeichert.` })
      setSelectedIds(new Set())
    } else {
      setFeedback({
        type: 'error',
        text: `${ok} gespeichert, ${fail} fehlgeschlagen.`,
      })
    }
  }

  const handleRowFieldKeyDown = (e, item) => {
    if (e.key !== 'Enter') return
    const d = rowDrafts[item.id] ?? draftFromItem(item)
    if (!isRowDraftDirty(item, d)) return
    e.preventDefault()
    void saveRowDraft(item.id)
  }

  const sortedItems = [...items].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' })
  )

  const filteredSortedItems = useMemo(() => {
    if (filterCategory === 'Alle') return sortedItems
    if (filterCategory === 'Ohne Kategorie') {
      return sortedItems.filter((it) => !String(it.category || '').trim())
    }
    return sortedItems.filter((it) => String(it.category || '').trim() === filterCategory)
  }, [sortedItems, filterCategory])

  const groupedItems = useMemo(() => {
    const groups = new Map()
    for (const item of filteredSortedItems) {
      const key = String(item.category || '').trim() || 'Ohne Kategorie'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de', { sensitivity: 'base' }))
  }, [filteredSortedItems])

  return (
    <div className="admin-view admin-page--magazin">
      {readOnlyMagazin ? (
        <p className="admin-feedback admin-feedback--ok admin-magazin-readonly-banner" role="status">
          Nur Lesezugriff: Artikel und Kategorien können nicht geändert werden.
        </p>
      ) : null}
      <header className="admin-magazin-header">
        <div className="admin-page-header">
          <div className="admin-page-header-text">
            <h2 className="admin-page-title" id="magazin-page-title">
              Magazin
            </h2>
            <p className="admin-page-lead">Artikel und Kategorien für Inventur und Zählung.</p>
          </div>
        </div>
        <div className="admin-magazin-categories-row">
          <nav
            className="inventur-categories admin-magazin-categories admin-magazin-categories-scroll"
            aria-label="Magazin nach Kategorie filtern"
          >
            {filterTabs.map((cat) => {
              const isActive = filterCategory === cat
              return (
                <div
                  key={cat}
                  className={`admin-magazin-tab-cell ${isActive ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className="inventur-category-tab"
                    onClick={() => setFilterCategory(cat)}
                  >
                    {cat}
                  </button>
                </div>
              )
            })}
            <span className="inventur-categories-spacer" aria-hidden="true" />
          </nav>
          <div className="admin-magazin-categories-toolbar">
            {!canMutate ? null : magazinQuickAddOpen ? (
              <form
                className="admin-magazin-quick-add-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = magazinQuickAddValue.trim()
                  if (!t) {
                    setMagazinQuickAddOpen(false)
                    return
                  }
                  onAddCategory(t)
                  setMagazinQuickAddValue('')
                  setMagazinQuickAddOpen(false)
                  setFeedback({ type: 'success', text: `Kategorie „${t}“ ergänzt.` })
                }}
              >
                <input
                  type="text"
                  value={magazinQuickAddValue}
                  onChange={(e) => setMagazinQuickAddValue(e.target.value)}
                  placeholder="Name"
                  maxLength={100}
                  autoComplete="off"
                  aria-label="Neuer Kategoriename"
                  autoFocus
                />
                <button type="submit" className="admin-btn-secondary">
                  Ok
                </button>
                <button
                  type="button"
                  className="admin-magazin-quick-add-cancel"
                  onClick={() => {
                    setMagazinQuickAddOpen(false)
                    setMagazinQuickAddValue('')
                  }}
                  aria-label="Abbrechen"
                >
                  ×
                </button>
              </form>
            ) : (
              <span
                className="admin-magazin-categories-add-link"
                role="button"
                tabIndex={0}
                aria-label="Neue Kategorie hinzufügen"
                onClick={() => {
                  setChipCategoryMenuOpen(null)
                  setMagazinQuickAddOpen(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setChipCategoryMenuOpen(null)
                    setMagazinQuickAddOpen(true)
                  }
                }}
              >
                <span className="admin-magazin-categories-plus-char" aria-hidden="true">
                  +
                </span>
                <span className="admin-magazin-categories-add-text">Neue Kategorie</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {feedback.text ? (
        <p
          className={
            feedback.type === 'error' ? 'admin-feedback admin-feedback--error' : 'admin-feedback admin-feedback--ok'
          }
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}

      <section className="admin-panel" aria-labelledby="admin-bestand">
        <div className="admin-panel-head">
          <h3 id="admin-bestand" className="admin-panel-title">
            Magazinartikel
          </h3>
          <div className="admin-panel-head-actions">
            {canMutate ? (
              <>
                <label
                  className={`admin-btn-secondary admin-btn-excel${busy ? ' is-busy' : ''}`}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="admin-file-input-hidden"
                    onChange={handleExcelFile}
                    disabled={busy || !onBulkImportArtikel}
                    aria-label="Excel-Datei mit Artikeln auswählen"
                  />
                  <FileSpreadsheet size={18} strokeWidth={2} aria-hidden="true" />
                  Excel importieren
                </label>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => setShowCreateForm((prev) => !prev)}
                >
                  {showCreateForm ? 'Schließen' : '+ Artikel'}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {canMutate && showCreateForm ? (
          <form className="admin-artikel-form" onSubmit={handleCreateArtikel}>
            <div className="admin-form-grid">
              <div className="admin-field">
                <label htmlFor="admin-artikelnummer">Artikelnummer *</label>
                <input
                  id="admin-artikelnummer"
                  type="text"
                  autoComplete="off"
                  placeholder="z. B. AFG-00001"
                  value={artikelnummer}
                  onChange={(e) => setArtikelnummer(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="admin-field">
                <label htmlFor="admin-preis">Preis *</label>
                <input
                  id="admin-preis"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={preisInput}
                  onChange={(e) => setPreisInput(e.target.value)}
                  required
                />
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="admin-name">Bezeichnung *</label>
                <input
                  id="admin-name"
                  type="text"
                  placeholder="Artikelname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              <div className="admin-field">
                <span className="admin-field-label" id="admin-einheit-label">
                  Einheit *
                </span>
                <div className="admin-einheit-combo" role="group" aria-labelledby="admin-einheit-label">
                  <select
                    className="admin-einheit-select"
                    aria-label="Bekannte Einheit aus Liste wählen"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) setEinheit(v)
                    }}
                  >
                    <option value="">Aus Liste wählen …</option>
                    {einheitenOptions.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                  <input
                    id="admin-einheit"
                    type="text"
                    placeholder="oder frei eingeben"
                    value={einheit}
                    onChange={(e) => setEinheit(e.target.value)}
                    required
                    maxLength={50}
                    autoComplete="off"
                    aria-label="Einheit (freie Eingabe)"
                  />
                </div>
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="admin-category">Kategorie</label>
                <input
                  id="admin-category"
                  type="text"
                  list="admin-category-datalist"
                  placeholder="Aus Liste wählen oder neu eingeben"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={100}
                />
                <datalist id="admin-category-datalist">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="admin-new-lager">Lager (optional)</label>
                <select
                  id="admin-new-lager"
                  className="admin-cell-select"
                  value={newLagerId}
                  onChange={(e) => {
                    setNewLagerId(e.target.value)
                    setNewUnterlagerId('')
                  }}
                  aria-label="Lager für neuen Artikel"
                >
                  <option value="">— Keines —</option>
                  {magazinLagerOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {String(l.name ?? l.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="admin-new-unterlager">Unterlager (optional)</label>
                <select
                  id="admin-new-unterlager"
                  className="admin-cell-select"
                  value={newUnterlagerId}
                  onChange={(e) => setNewUnterlagerId(e.target.value)}
                  disabled={!newLagerId.trim()}
                  aria-label="Unterlager für neuen Artikel"
                >
                  <option value="">— Keines —</option>
                  {(magazinUlsByLagerId.get(newLagerId.trim()) ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {String(u.name ?? u.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary" disabled={busy}>
                {busy ? 'Speichern …' : 'In PocketBase anlegen'}
              </button>
            </div>
          </form>
        ) : null}

        {sortedItems.length === 0 ? (
          <p className="admin-empty">Noch keine Artikel geladen.</p>
        ) : groupedItems.length === 0 ? (
          <p className="admin-empty">Keine Artikel in dieser Kategorie.</p>
        ) : (
          <>
            {canMutate && selectedIds.size > 0 ? (
              <div className="admin-bulk-selection-bar" role="region" aria-label="Massenauswahl Kategorie">
                <span className="admin-bulk-selection-count">{selectedIds.size} ausgewählt</span>
                <select
                  className="admin-cell-select admin-bulk-cat-select"
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  aria-label="Kategorie für alle Ausgewählten"
                  disabled={bulkSaving}
                >
                  <option value="">— Keine —</option>
                  {categorySelectOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={applyBulkCategoryDraft}
                  disabled={bulkSaving}
                >
                  Im Entwurf setzen
                </button>
                <button
                  type="button"
                  className="admin-btn-row admin-btn-row--save"
                  onClick={() => void bulkSaveSelected()}
                  disabled={bulkSaving || !onUpdateArtikel}
                >
                  {bulkSaving ? '…' : 'Ausgewählte speichern'}
                </button>
                <button
                  type="button"
                  className="admin-btn-row"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkSaving}
                >
                  Auswahl leeren
                </button>
              </div>
            ) : null}
            <div className="admin-category-groups">
              {groupedItems.map(([groupName, groupRows]) => (
              <section key={groupName} className="admin-category-group" aria-label={`Kategorie ${groupName}`}>
                <h4 className="admin-category-group-title">{groupName}</h4>
                <div className="admin-table-wrap">
                  <table className="admin-artikel-table">
                    <colgroup>
                      <col className="admin-col-nr" />
                      <col className="admin-col-name" />
                      <col className="admin-col-preis" />
                      <col className="admin-col-einh" />
                      <col className="admin-col-cat" />
                      <col className="admin-col-menu" />
                      <col className="admin-col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Nr.</th>
                        <th scope="col">Name</th>
                        <th scope="col" className="admin-td-num">
                          Preis
                        </th>
                        <th scope="col">Einh.</th>
                        <th scope="col" className="admin-th-cat-with-cb">
                          <span className="admin-th-cat-inner">
                            <span className="admin-th-cat-heading">Kategorie</span>
                            <input
                              type="checkbox"
                              className="admin-cat-row-checkbox"
                              aria-label={`Alle Artikel in „${groupName}“ auswählen`}
                              checked={
                                groupRows.length > 0 &&
                                groupRows.every((r) => selectedIds.has(r.id))
                              }
                              ref={(el) => {
                                if (el && groupRows.length > 0) {
                                  const c = groupRows.filter((r) => selectedIds.has(r.id)).length
                                  el.indeterminate = c > 0 && c < groupRows.length
                                }
                              }}
                              onChange={() => toggleGroupSelected(groupRows)}
                              disabled={bulkSaving || savingId != null || readOnlyMagazin}
                            />
                          </span>
                        </th>
                        <th scope="col" className="admin-th-menu">
                          Menü
                        </th>
                        <th scope="col" className="admin-th-actions">
                          Speichern
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((item) => {
                        const d = rowDrafts[item.id] ?? draftFromItem(item)
                        const rowSaving = savingId === item.id
                        const rowArchiving = archivingId === item.id
                        const rowDeleting = deletingId === item.id
                        const anySaving = savingId != null || bulkSaving
                        const rowLocked = anySaving || rowArchiving || rowDeleting || readOnlyMagazin
                        const showSave = isRowDraftDirty(item, d)
                        const catTrim = String(d.category ?? '').trim()
                        const catInList = categorySelectOptions.includes(catTrim)
                        const einRaw = String(d.einheit ?? '').trim()
                        const einForSelect = einRaw || 'Stk'
                        const einInList = einheitenOptions.includes(einForSelect)
                        return (
                          <tr key={item.id} className="admin-artikel-row admin-artikel-row--inline">
                            <td>
                              <input
                                className="admin-cell-input"
                                style={{ borderColor: 'transparent', boxShadow: 'none', background: 'transparent' }}
                                aria-label={`Artikelnummer ${item.name || item.id}`}
                                value={d.artikelnummer}
                                onChange={(e) => patchRowDraft(item.id, { artikelnummer: e.target.value })}
                                onKeyDown={(e) => handleRowFieldKeyDown(e, item)}
                                maxLength={100}
                                autoComplete="off"
                                disabled={rowLocked}
                              />
                            </td>
                            <td>
                              <input
                                className="admin-cell-input"
                                style={{ borderColor: 'transparent', boxShadow: 'none', background: 'transparent' }}
                                aria-label={`Bezeichnung ${item.artikelnummer || ''}`}
                                value={d.name}
                                onChange={(e) => patchRowDraft(item.id, { name: e.target.value })}
                                onKeyDown={(e) => handleRowFieldKeyDown(e, item)}
                                maxLength={255}
                                disabled={rowLocked}
                              />
                            </td>
                            <td className="admin-td-num">
                              <input
                                className="admin-cell-input"
                                style={{ borderColor: 'transparent', boxShadow: 'none', background: 'transparent' }}
                                aria-label="Preis"
                                inputMode="decimal"
                                value={d.preisInput}
                                onChange={(e) => patchRowDraft(item.id, { preisInput: e.target.value })}
                                onKeyDown={(e) => handleRowFieldKeyDown(e, item)}
                                disabled={rowLocked}
                              />
                            </td>
                            <td>
                              <select
                                className="admin-cell-select"
                                style={{ borderColor: 'transparent', boxShadow: 'none', background: 'transparent' }}
                                aria-label="Einheit"
                                value={einForSelect}
                                onChange={(e) =>
                                  patchRowDraft(item.id, { einheit: e.target.value })
                                }
                                onKeyDown={(e) => handleRowFieldKeyDown(e, item)}
                                disabled={rowLocked}
                              >
                                {einheitenOptions.map((e) => (
                                  <option key={e} value={e}>
                                    {e}
                                  </option>
                                ))}
                                {einForSelect && !einInList ? (
                                  <option value={einForSelect}>{einForSelect}</option>
                                ) : null}
                              </select>
                            </td>
                            <td className="admin-td-cat-picker">
                              <div className="admin-cell-category-picker">
                                <select
                                  className="admin-cell-select admin-cell-select--in-cat-cell"
                                  style={{ borderColor: 'transparent', boxShadow: 'none', background: 'transparent' }}
                                  aria-label="Kategorie"
                                  value={catTrim}
                                  onChange={(e) =>
                                    patchRowDraft(item.id, { category: e.target.value })
                                  }
                                  onKeyDown={(e) => handleRowFieldKeyDown(e, item)}
                                  disabled={rowLocked}
                                >
                                  <option value="">— Keine —</option>
                                  {categorySelectOptions.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                  {catTrim && !catInList ? (
                                    <option value={catTrim}>{catTrim}</option>
                                  ) : null}
                                </select>
                                <input
                                  type="checkbox"
                                  className="admin-cat-row-checkbox"
                                  aria-label={`${d.name || d.artikelnummer || item.id} auswählen`}
                                  checked={selectedIds.has(item.id)}
                                  onChange={() => toggleRowSelected(item.id)}
                                  disabled={rowLocked}
                                />
                              </div>
                            </td>
                            <td className="admin-row-menu-cell">
                              <div className="admin-row-menu-wrap" data-admin-row-menu={item.id}>
                                <button
                                  type="button"
                                  className="admin-row-menu-trigger"
                                  aria-haspopup="menu"
                                  aria-expanded={rowActionMenuOpen === item.id}
                                  aria-label={`${d.name || d.artikelnummer || item.id}: Aktionen`}
                                  onClick={(e) =>
                                    setRowActionMenuOpen((cur) => {
                                      const next = cur === item.id ? null : item.id
                                      if (next == null) {
                                        setRowActionMenuPos(null)
                                      } else {
                                        const r = e.currentTarget.getBoundingClientRect()
                                        setRowActionMenuPos({
                                          top: Math.round(r.bottom + 6),
                                          left: Math.round(r.left),
                                        })
                                      }
                                      return next
                                    })
                                  }
                                  disabled={anySaving || rowArchiving || rowDeleting}
                                >
                                  <ChevronDown
                                    className="admin-row-menu-trigger-icon"
                                    size={18}
                                    strokeWidth={2.25}
                                    aria-hidden
                                  />
                                </button>
                                {rowActionMenuOpen === item.id ? (
                                  <div
                                    className="admin-row-menu-dropdown"
                                    role="menu"
                                    style={
                                      rowActionMenuPos
                                        ? {
                                            top: `${rowActionMenuPos.top}px`,
                                            left: `${rowActionMenuPos.left}px`,
                                          }
                                        : undefined
                                    }
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="admin-row-menu-item admin-row-menu-item--danger"
                                      onClick={() => void deleteRowArtikel(item)}
                                      disabled={!canMutate || !onDeleteArtikel || anySaving || rowArchiving || rowDeleting}
                                    >
                                      <span className="admin-row-menu-item-icon" aria-hidden="true">
                                        x
                                      </span>
                                      Löschen
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="admin-row-menu-item admin-row-menu-item--warn"
                                      onClick={() => void archiveRowArtikel(item)}
                                      disabled={!canMutate || !onArchiveArtikel || anySaving || rowArchiving || rowDeleting}
                                    >
                                      <span className="admin-row-menu-item-icon" aria-hidden="true">
                                        ←
                                      </span>
                                      Archivieren
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="admin-row-actions">
                              <div className="admin-row-actions-inner">
                                {canMutate && showSave ? (
                                  <button
                                    type="button"
                                    className="admin-btn-row admin-btn-row--save"
                                    onClick={() => saveRowDraft(item.id)}
                                    disabled={!onUpdateArtikel || anySaving}
                                  >
                                    {rowSaving ? '…' : 'Speichern'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="admin-kategorien">
        <h3 id="admin-kategorien" className="admin-panel-title">
          Kategorien für die Inventur
        </h3>
        <p className="admin-panel-hint">
          Tabs in der Inventur; Zahnrad: Umbenennen (alle Artikel) oder Löschen (Kategorie entfernen / leeren Tab).
        </p>
        {canMutate ? (
          <form onSubmit={handleAddCategory} className="admin-inline-form">
            <input
              type="text"
              placeholder="Neue Kategorie"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              aria-label="Kategoriename"
            />
            <button type="submit" className="admin-btn-secondary">
              Hinzufügen
            </button>
          </form>
        ) : null}
        {categories.length > 0 ? (
          <div className="admin-category-chips">
            {categories.map((c) => (
              <div key={c} className="admin-category-chip">
                <span className="admin-category-chip-label">{c}</span>
                {canMutate && (onRenameCategory || onDeleteCategory) ? (
                  <div
                    className="admin-category-chip-menu-wrap"
                    data-admin-cat-menu-chip={c}
                  >
                    <button
                      type="button"
                      className="admin-category-chip-gear"
                      aria-expanded={chipCategoryMenuOpen === c}
                      aria-haspopup="menu"
                      aria-label={`Kategorie „${c}“: Aktionen`}
                      disabled={categoryActionBusy}
                      onClick={() => {
                        setChipCategoryMenuOpen((cur) => (cur === c ? null : c))
                      }}
                    >
                      <Cog size={16} strokeWidth={2} aria-hidden />
                    </button>
                    {chipCategoryMenuOpen === c ? (
                      <div className="admin-category-chip-dropdown" role="menu">
                        {onRenameCategory ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="admin-category-chip-menu-item"
                            onClick={() => {
                              setChipCategoryMenuOpen(null)
                              openRenameCategory(c)
                            }}
                          >
                            Umbenennen
                          </button>
                        ) : null}
                        {onDeleteCategory ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="admin-category-chip-menu-item admin-category-chip-menu-item--danger"
                            onClick={() => handleCategoryDelete(c)}
                          >
                            Löschen
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {canMutate && renameFrom != null && onRenameCategory ? (
          <form className="admin-rename-category-form" onSubmit={submitRenameCategory}>
            <p className="admin-rename-category-title">
              Kategorie „{renameFrom}“ umbenennen in:
            </p>
            <div className="admin-inline-form admin-rename-category-fields">
              <input
                type="text"
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                maxLength={100}
                autoComplete="off"
                aria-label="Neuer Kategoriename"
                disabled={categoryActionBusy}
              />
              <button type="submit" className="admin-btn-secondary" disabled={categoryActionBusy}>
                {categoryActionBusy ? '…' : 'Speichern'}
              </button>
              <button
                type="button"
                className="admin-btn-row"
                onClick={cancelRenameCategory}
                disabled={categoryActionBusy}
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  )
}

export default AdminView
