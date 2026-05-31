# Inventurenseite (Backend Admin-Interface) – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete backend admin interface for inventory (Inventur) lifecycle management where Schichtleiter & Admins can create, start, complete, and export inventories using a 3-column Master Template layout.

**Architecture:** 3-column layout (Master Template): Sidebar (lager/warehouse filter) | Inventory Table (all statuses) | Detail Panel (full info + lifecycle actions). Real-time subscriptions to `zaehl_sessions` collection with metrics calculated from `zaehlung_aktuell`.

**Tech Stack:** React, Vite, TailwindCSS, PocketBase SDK, `sonner` for toasts, Radix UI for dialogs.

---

## Task 1: Create Directory Structure & Entry Point

**Files:**
- Create: `src/backend/inventuren/InventurenPage.jsx`
- Create: `src/backend/inventuren/inventuren-shell.jsx` (stub)
- Create: `src/backend/inventuren/types.js` (stub)

- [ ] **Step 1: Create InventurenPage.jsx**

```jsx
import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InventurenShell } from './inventuren-shell.jsx'

/**
 * Inventurenseite (Backend Admin-Interface).
 * 3-Spalten-Layout: Sidebar (Lager-Filter) | Tabelle | Detail-Panel
 */
export default function InventurenPage(props) {
  const client = useMemo(() => new QueryClient(), [])
  return (
    <QueryClientProvider client={client}>
      <InventurenShell {...props} />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Create inventuren-shell.jsx (stub)**

```jsx
export function InventurenShell({ currentUser }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background text-foreground">
      {/* Sidebar wird hier eingefügt */}
      {/* Tabelle wird hier eingefügt */}
      {/* Detail-Panel wird hier eingefügt */}
    </div>
  )
}
```

- [ ] **Step 3: Create types.js (stub)**

```js
export function mapPbRecordToInventory(record) {
  // Wird implementiert in Task 2
  return null
}
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/inventuren/
git commit -m "feat: scaffold inventurenseite structure"
```

---

## Task 2: Implement Types & Data Mapping

**Files:**
- Modify: `src/backend/inventuren/types.js`

- [ ] **Step 1: Implement mapPbRecordToInventory**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/inventuren/types.js
git commit -m "feat: implement inventory mapping and utility functions"
```

---

## Task 8: Implement App Routes & Navigation Integration

**Files:**
- Modify: `src/App.jsx` (add route + nav item)
- Update: Navigation component if exists

- [ ] **Step 1: Add Inventuren route to App.jsx**

Locate the route section in `src/App.jsx` where other backend pages are defined (around line 200-250). Add:

```jsx
{
  path: '/admin/inventuren',
  element: <InventurenPage currentUser={user} />,
  meta: { title: 'Inventuren' }
}
```

And import at top:
```jsx
import InventurenPage from './backend/inventuren/InventurenPage.jsx'
```

- [ ] **Step 2: Add navigation menu item**

Find the navigation/sidebar component in App.jsx (or check `src/components/Navigation.jsx` or `src/components/Sidebar.jsx`). Add:

```jsx
{
  icon: '📦',
  label: 'Inventuren',
  path: '/admin/inventuren',
  allowRoles: ['admin', 'schichtleiter'] // Only Schichtleiter & Admins
}
```

- [ ] **Step 3: Test route navigation**

```bash
npm run dev
# Navigate to http://localhost:5173/admin/inventuren
# Verify page loads with empty state (no inventuren yet)
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/Navigation.jsx
git commit -m "feat: add inventurenseite route and navigation"
```

---

## Task 9: Testing & Final Integration

**Files:**
- Test: Manual testing + light integration

- [ ] **Step 1: Test Create Inventory Flow**

```bash
npm run dev
# Navigate to /admin/inventuren
# Click "+ Neue Inventur"
# Fill in: Name="Test Inventur", Lager="Küche", Verantwortlicher="Select one", Notizen="Test"
# Click "Erstellen"
# Verify toast "Inventur erstellt" appears
# Verify new row appears in table
# Verify sidebar counts update
```

- [ ] **Step 2: Test Filter & Selection**

```
# In the same session, with test inventory visible
# Click "Küche" in sidebar
# Verify table only shows Küche inventuren
# Click on test inventory row
# Verify detail panel appears on right with full info
# Click "Alle" in sidebar
# Verify table shows all inventuren again
```

- [ ] **Step 3: Test Lifecycle Actions**

```
# With test inventory selected & status=Vorbereitung
# Click [Starten] in detail panel
# Verify toast "Status zu Aktiv geändert"
# Verify detail panel & table row update immediately
# Click [Abschließen] in detail panel
# Verify status changes to "Abgeschlossen"
# Verify [Archivieren] button becomes available
# (Don't click Archive yet – leave for manual verification)
```

- [ ] **Step 4: Check Real-time Sync**

```
# Open same inventory in two browser tabs
# Modify status in one tab (e.g., start it)
# Observe other tab updates automatically within 1-2 seconds
# Both show same status
```

- [ ] **Step 5: Test Dialog Validation**

```
# Click "+ Neue Inventur" again
# Try submitting with empty Name → verify "Name erforderlich" toast
# Fill Name, try empty Verantwortlicher → verify "Verantwortlicher erforderlich" toast
# Fill all required fields, submit successfully
```

- [ ] **Step 6: Verify Permissions Check**

```
# Log in as normal Mitarbeiter (non-Schichtleiter)
# Navigate to /admin/inventuren
# Verify page is either inaccessible or shows read-only view
# (Implementation depends on app's permission system)
```

- [ ] **Step 7: Final Commit**

```bash
git status
git add -A
git commit -m "feat: inventurenseite complete - all components, lifecycle, real-time sync"
```

- [ ] **Step 8: Document Inventurenseite (Optional)**

Update `docs/superpowers/specs/2026-06-01-inventurenseite-design.md` with "Implementation Complete" note at top.

```bash
git add docs/superpowers/specs/2026-06-01-inventurenseite-design.md
git commit -m "docs: mark inventurenseite spec as implemented"
```

---

## Summary

**Completed Components:**
1. ✅ Entry point (QueryClientProvider + InventurenPage)
2. ✅ Type utilities & data mapping
3. ✅ Sidebar lager filter
4. ✅ Inventory table with columns
5. ✅ Detail panel with lifecycle actions
6. ✅ New inventory creation dialog
7. ✅ InventurenShell state container with subscriptions
8. ✅ App routes & navigation integration
9. ✅ Testing & verification

**Architecture Delivered:**
- ✅ 3-column Master Template layout
- ✅ Real-time PocketBase subscriptions
- ✅ Lager filtering with counts
- ✅ Lifecycle status management (Vorbereitung → Aktiv → Abgeschlossen → Archivieren)
- ✅ Export button placeholder (ready for later implementation)
- ✅ Permissions: Schichtleiter & Admins only
- ✅ Index HTML completely untouched

**Files Created:**
- `src/backend/inventuren/InventurenPage.jsx` (entry point)
- `src/backend/inventuren/inventuren-shell.jsx` (state container)
- `src/backend/inventuren/sidebar-lager.jsx` (filter)
- `src/backend/inventuren/inventory-table.jsx` (table)
- `src/backend/inventuren/inventory-detail.jsx` (detail panel)
- `src/backend/inventuren/new-inventory-dialog.jsx` (create dialog)
- `src/backend/inventuren/types.js` (utilities)

**Next Phase (Future):**
- Export functionality (PDF/Excel/CSV)
- Bulk actions
- Advanced filtering
- Import from Excel

---

## Task 3: Implement Sidebar Lager Filter

**Files:**
- Create: `src/backend/inventuren/sidebar-lager.jsx`

- [ ] **Step 1: Create sidebar-lager.jsx**

```jsx
import { cn } from '../../lib/cn.js'
import { LAGER_OPTIONS } from './types.js'

/**
 * @param {object} props
 * @param {Record<string, number>} props.countsByLager - { alle, küche, restaurant, brauerei }
 * @param {string} props.activeLager - 'alle' | 'küche' | 'restaurant' | 'brauerei'
 * @param {(lager: string) => void} props.onSelectLager
 */
export function SidebarLager({ countsByLager, activeLager, onSelectLager }) {
  const lagerOrder = ['alle', 'küche', 'restaurant', 'brauerei']

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Lager</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {lagerOrder.map((lagerKey) => (
          <button
            key={lagerKey}
            type="button"
            onClick={() => onSelectLager(lagerKey)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]',
              activeLager === lagerKey
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <span>{LAGER_OPTIONS[lagerKey].label}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {countsByLager[lagerKey] ?? 0}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/inventuren/sidebar-lager.jsx
git commit -m "feat: implement sidebar lager filter"
```

---

## Task 4: Implement Inventory Table

**Files:**
- Create: `src/backend/inventuren/inventory-table.jsx`

- [ ] **Step 1: Create inventory-table.jsx**

```jsx
import { INVENTORY_STATUSES, formatDate, formatEuro } from './types.js'

/**
 * @param {object} props
 * @param {Array} props.inventuren - Filtered inventory list
 * @param {string|null} props.selectedId - Current selection for detail panel
 * @param {(id: string) => void} props.onSelectRow
 * @param {() => void} props.onNewClick
 * @param {() => void} props.onExportClick
 */
export function InventoryTable({
  inventuren,
  selectedId,
  onSelectRow,
  onNewClick,
  onExportClick,
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Inventuren ({inventuren.length})</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportClick}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] text-foreground hover:bg-muted/60"
          >
            Export
          </button>
          <button
            type="button"
            onClick={onNewClick}
            className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Neue Inventur
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 border-b border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="min-w-[150px] text-[11px] font-medium text-muted-foreground">Name</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Lager</div>
            <div className="w-[80px] text-[11px] font-medium text-muted-foreground">Artikel</div>
            <div className="w-[80px] text-[11px] font-medium text-muted-foreground">Abw.</div>
            <div className="w-[100px] text-[11px] font-medium text-muted-foreground">Status</div>
            <div className="w-[120px] text-[11px] font-medium text-muted-foreground">Verantwort.</div>
            <div className="w-[150px] text-[11px] font-medium text-muted-foreground">Startdatum</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {inventuren.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[13px] text-muted-foreground">
              Keine Inventuren in diesem Lager.
            </div>
          ) : (
            inventuren.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onSelectRow(inv.id)}
                className={`flex min-h-0 border-b border-border/50 px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === inv.id ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-4 items-center">
                  <div className="min-w-[150px] text-[12.5px] font-medium truncate">{inv.name}</div>
                  <div className="w-[100px] text-[12.5px] text-muted-foreground truncate">{inv.lager}</div>
                  <div className="w-[80px] text-[12.5px]">{inv.artikelCount}</div>
                  <div className="w-[80px] text-[12.5px]">{inv.abweichungen}</div>
                  <div className="w-[100px] text-[12.5px]">
                    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${
                      inv.status === 'aktiv' ? 'bg-green-100 text-green-800' : 
                      inv.status === 'abgeschlossen' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {INVENTORY_STATUSES[inv.status]?.label || inv.status}
                    </span>
                  </div>
                  <div className="w-[120px] text-[12px] text-muted-foreground truncate">{inv.verantwortlicher}</div>
                  <div className="w-[150px] text-[11px] text-muted-foreground">{formatDate(inv.startDatum)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/inventuren/inventory-table.jsx
git commit -m "feat: implement inventory table with all columns"
```

---

## Task 5: Implement New Inventory Dialog

**Files:**
- Create: `src/backend/inventuren/new-inventory-dialog.jsx`

- [ ] **Step 1: Create new-inventory-dialog.jsx**

```jsx
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { LAGER_OPTIONS } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.tenantId - Current user's tenant
 * @param {Array} props.verantwortliche - List of Schichtleiter/Admins
 * @param {() => Promise<void>} props.onInventoryCreated - Callback nach Erstellung
 */
export function NewInventoryDialog({ open, onOpenChange, tenantId, verantwortliche = [], onInventoryCreated }) {
  const [name, setName] = useState('')
  const [lager, setLager] = useState('küche')
  const [verantwortlicher, setVerantwortlicher] = useState('')
  const [notizen, setNotizen] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Name erforderlich')
      return
    }
    if (!lager) {
      toast.error('Lager erforderlich')
      return
    }
    if (!verantwortlicher) {
      toast.error('Verantwortlicher erforderlich')
      return
    }

    setLoading(true)
    try {
      await pb.collection(PB_COLLECTIONS.zaehlSessions).create({
        name: trimmedName,
        lager: lager,
        session_owner: verantwortlicher,
        standort: tenantId,
        status: 'vorbereitung',
        notizen: notizen.trim(),
      })
      toast.success('Inventur erstellt')
      setName('')
      setLager('küche')
      setVerantwortlicher('')
      setNotizen('')
      onOpenChange(false)
      await onInventoryCreated()
    } catch (err) {
      toast.error('Inventur konnte nicht erstellt werden')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-4 text-base font-semibold text-foreground">
            Neue Inventur erstellen
          </Dialog.Title>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Name / Titel
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Inventur Mai 2026"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Lager
            </label>
            <select
              value={lager}
              onChange={(e) => setLager(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            >
              {Object.values(LAGER_OPTIONS)
                .filter((l) => l.key !== 'alle')
                .map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Verantwortlicher
            </label>
            <select
              value={verantwortlicher}
              onChange={(e) => setVerantwortlicher(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={loading}
            >
              <option value="">-- Wähle einen Schichtleiter --</option>
              {verantwortliche.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Notizen (optional)
            </label>
            <textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              placeholder="Zusätzliche Notizen..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
                disabled={loading}
              >
                Abbrechen
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Wird erstellt…' : 'Erstellen'}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/inventuren/new-inventory-dialog.jsx
git commit -m "feat: implement new inventory creation dialog"
```

---

## Task 6: Implement Inventory Detail Panel

**Files:**
- Create: `src/backend/inventuren/inventory-detail.jsx`

- [ ] **Step 1: Create inventory-detail.jsx**

```jsx
import { useState } from 'react'
import { toast } from 'sonner'
import { formatDate, formatEuro, INVENTORY_STATUSES } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {object|null} props.inventory - Selected inventory or null
 * @param {() => Promise<void>} props.onUpdate - Callback nach Update
 */
export function InventoryDetail({ inventory, onUpdate }) {
  const [loading, setLoading] = useState(false)

  if (!inventory) {
    return (
      <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-muted/20 p-4">
        <p className="text-[13px] text-muted-foreground">Wähle eine Inventur aus</p>
      </div>
    )
  }

  const handleStatusChange = async (newStatus) => {
    setLoading(true)
    try {
      const updateData = { status: newStatus }
      if (newStatus === 'aktiv' && !inventory.startDatum) {
        updateData.start_time = new Date().toISOString()
      }
      if (newStatus === 'abgeschlossen' && !inventory.endDatum) {
        updateData.end_time = new Date().toISOString()
      }
      await pb.collection(PB_COLLECTIONS.zaehlSessions).update(inventory.id, updateData)
      toast.success(`Status zu "${INVENTORY_STATUSES[newStatus]?.label}" geändert`)
      await onUpdate()
    } catch {
      toast.error('Status konnte nicht geändert werden')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!window.confirm('Inventur archivieren?')) return
    setLoading(true)
    try {
      // Kopiere zu inventur_archiv
      await pb.collection(PB_COLLECTIONS.inventurArchiv).create({
        name: inventory.name,
        lager: inventory.lager,
        session_owner: inventory.verantwortlicher,
        standort: inventory.tenantId,
        status: 'abgeschlossen',
        artikel_count: inventory.artikelCount,
        abweichungen: inventory.abweichungen,
        euro_wert_soll: inventory.euroWertSoll,
        euro_wert_ist: inventory.euroWertIst,
        start_time: inventory.startDatum,
        end_time: inventory.endDatum,
        notizen: inventory.notizen,
      })
      // Lösche aus zaehl_sessions
      await pb.collection(PB_COLLECTIONS.zaehlSessions).delete(inventory.id)
      toast.success('Inventur archiviert')
      await onUpdate()
    } catch {
      toast.error('Archivierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const euroDiff = inventory.euroWertIst - inventory.euroWertSoll

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center border-b border-border px-3 py-2">
        <h3 className="truncate text-sm font-semibold">{inventory.name}</h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-4">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Lager</p>
          <p className="text-[13px] text-foreground">{inventory.lager}</p>
        </div>

        <div className="mb-4">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Verantwortlicher</p>
          <p className="text-[13px] text-foreground">{inventory.verantwortlicher}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Status</p>
          <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${
            inventory.status === 'aktiv' ? 'bg-green-100 text-green-800' : 
            inventory.status === 'abgeschlossen' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {INVENTORY_STATUSES[inventory.status]?.label || inventory.status}
          </span>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Artikel gezählt</p>
          <p className="text-[13px] text-foreground">{inventory.artikelCount}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Abweichungen</p>
          <p className="text-[13px] text-foreground">{inventory.abweichungen}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Euro-Wert (Soll)</p>
          <p className="text-[13px] text-foreground">{formatEuro(inventory.euroWertSoll)}</p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Euro-Wert (Ist)</p>
          <p className="text-[13px] text-foreground">{formatEuro(inventory.euroWertIst)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Differenz</p>
          <p className={`text-[13px] font-medium ${euroDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatEuro(euroDiff)}
          </p>
        </div>

        <div className="mb-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Startdatum</p>
          <p className="text-[13px] text-foreground">{formatDate(inventory.startDatum)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Enddatum</p>
          <p className="text-[13px] text-foreground">{formatDate(inventory.endDatum)}</p>
        </div>

        <div className="mb-6">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Notizen</p>
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{inventory.notizen || '—'}</p>
        </div>

        <hr className="border-border my-4" />

        <div className="space-y-2">
          {inventory.status === 'vorbereitung' && (
            <button
              type="button"
              onClick={() => handleStatusChange('aktiv')}
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Starten
            </button>
          )}
          {inventory.status === 'aktiv' && (
            <button
              type="button"
              onClick={() => handleStatusChange('abgeschlossen')}
              disabled={loading}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Abschließen
            </button>
          )}
          {inventory.status === 'abgeschlossen' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={loading}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              Archivieren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/inventuren/inventory-detail.jsx
git commit -m "feat: implement inventory detail panel with lifecycle actions"
```

---

## Task 7: Implement InventurenShell State Container

**Files:**
- Modify: `src/backend/inventuren/inventuren-shell.jsx`

- [ ] **Step 1: Implement full inventuren-shell.jsx**

```jsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SidebarLager } from './sidebar-lager.jsx'
import { InventoryTable } from './inventory-table.jsx'
import { InventoryDetail } from './inventory-detail.jsx'
import { NewInventoryDialog } from './new-inventory-dialog.jsx'
import { mapPbRecordToInventory, countsByLager, filterByLager } from './types.js'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'

/**
 * @param {object} props
 * @param {object} props.currentUser - Current authenticated user (with tenantId)
 */
export function InventurenShell({ currentUser }) {
  const [activeLager, setActiveLager] = useState('alle')
  const [selectedInventurId, setSelectedInventurId] = useState(null)
  const [inventurenDialogOpen, setInventurenDialogOpen] = useState(false)
  const [verantwortliche, setVerantwortliche] = useState([])

  const { data: inventuren = [], refetch: refetchInventuren } = useQuery({
    queryKey: ['inventuren', currentUser?.tenantId],
    queryFn: async () => {
      if (!currentUser?.tenantId) return []
      try {
        const records = await pb.collection(PB_COLLECTIONS.zaehlSessions).getFullList({
          filter: `standort = "${currentUser.tenantId}"`,
          expand: 'session_owner',
          sort: '-created',
        })
        return records.map(mapPbRecordToInventory)
      } catch (err) {
        toast.error('Inventuren konnten nicht geladen werden')
        console.error(err)
        return []
      }
    },
    enabled: !!currentUser?.tenantId,
  })

  // Load Schichtleiter/Admin list for dialog
  useEffect(() => {
    const loadVerantwortliche = async () => {
      if (!currentUser?.tenantId) return
      try {
        const records = await pb.collection(PB_COLLECTIONS.users).getFullList({
          filter: `tenant_id = "${currentUser.tenantId}" && (role = "schichtleiter" || role = "admin")`,
        })
        setVerantwortliche(records.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` })))
      } catch (err) {
        console.error('Failed to load verantwortliche:', err)
      }
    }
    loadVerantwortliche()
  }, [currentUser?.tenantId])

  // Subscribe to real-time updates
  const memoRefetch = useCallback(() => refetchInventuren(), [refetchInventuren])

  useEffect(() => {
    if (!currentUser?.tenantId) return
    let unsubscribe = null
    const subscribe = async () => {
      try {
        unsubscribe = await pb.collection(PB_COLLECTIONS.zaehlSessions).subscribe('*', () => {
          memoRefetch()
        })
      } catch (err) {
        console.error('Subscribe error:', err)
      }
    }
    subscribe()
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe().catch(() => {})
      }
    }
  }, [currentUser?.tenantId, memoRefetch])

  // Filter inventuren by lager
  const filteredInventuren = useMemo(() => filterByLager(inventuren, activeLager), [inventuren, activeLager])
  const lagerCounts = useMemo(() => countsByLager(inventuren), [inventuren])
  const selectedInventur = useMemo(() => inventuren.find((i) => i.id === selectedInventurId), [inventuren, selectedInventurId])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <SidebarLager
        countsByLager={lagerCounts}
        activeLager={activeLager}
        onSelectLager={(lager) => {
          setActiveLager(lager)
          setSelectedInventurId(null)
        }}
      />
      <InventoryTable
        inventuren={filteredInventuren}
        selectedId={selectedInventurId}
        onSelectRow={setSelectedInventurId}
        onNewClick={() => setInventurenDialogOpen(true)}
        onExportClick={() => toast.info('Export wird implementiert in späteren Tasks')}
      />
      <InventoryDetail inventory={selectedInventur} onUpdate={refetchInventuren} />
      <NewInventoryDialog
        open={inventurenDialogOpen}
        onOpenChange={setInventurenDialogOpen}
        tenantId={currentUser?.tenantId}
        verantwortliche={verantwortliche}
        onInventoryCreated={refetchInventuren}
      />
    </div>
  )
}