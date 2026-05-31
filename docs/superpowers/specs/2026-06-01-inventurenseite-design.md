# Inventurenseite (Backend Admin-Interface) – Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a backend admin interface for complete inventory (Inventur) lifecycle management where Schichtleiter & Admins can create, start, manage, complete, and export inventories across multiple warehouses.

**Architecture:** 3-column layout (Master Template): Sidebar (lager/warehouse filter) | Content (inventory table) | Detail Panel (full info + actions). Loads from `zaehl_sessions` and `inventur_archiv` PocketBase collections with real-time subscriptions.

**Tech Stack:** React, Vite, TailwindCSS, PocketBase SDK, `sonner` for toasts, Radix UI for dialogs.

---

## 1. Architektur & 3-Spalten Layout

**3-Column Layout (Master Template konsistent):**
- **Linke Sidebar (220px):** Lager-Filter mit Counts (Alle, Küche, Restaurant, Brauerei)
- **Mittlere Spalte (flex):** Inventur-Tabelle mit allen Spalten
- **Rechte Detail-Panel (300px):** Vollständige Inventur-Infos + Aktionen

**File-Struktur:**
- `src/backend/inventuren/` (neuer Ordner, wie `magazin/` und `mitarbeiter/`)
  - `InventurenPage.jsx` (Entry point, QueryClientProvider)
  - `inventuren-shell.jsx` (Main State Container, Daten-Laden)
  - `sidebar-lager.jsx` (Lager-Filter Sidebar)
  - `inventory-table.jsx` (Tabelle mit Inventuren)
  - `inventory-detail.jsx` (Detail-Panel rechts)
  - `new-inventory-dialog.jsx` (Dialog zum Erstellen)
  - `types.js` (Utilities, mapPbRecordToInventory, etc.)

**Header-Bereich (Tabelle):**
- "Inventuren (X)" mit Count gefiltert nach Lager
- **"+ Neue Inventur"** Button (nur Schichtleiter & Admins)
- **Export-Button** (PDF/Excel/CSV Dropdown)

---

## 2. Sidebar (Lager-Filter)

**Layout:**
- `h-12` Header mit "Lager" Label (Master Template)
- Vier Filter-Buttons:
  - "Alle (X)" - Default, zeigt alle Inventuren aller Lager
  - "Küche (X)" - nur Küche-Inventuren
  - "Restaurant (X)" - nur Restaurant-Inventuren
  - "Brauerei (X)" - nur Brauerei-Inventuren

**Styling:**
- `w-[220px]` fixed width
- Active Button: `bg-muted font-medium text-foreground`
- Inactive: `text-muted-foreground hover:bg-muted/60 hover:text-foreground`
- Button: `flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]`
- Counts rechts: `text-xs text-muted-foreground tabular-nums`

**Verhalten:**
- Click auf Filter → `setActiveStorageFilter(lager)`
- Tabelle re-filtered sofort
- Sidebar-Counts zeigen immer Gesamt (auch inaktive Filter)
- Detail-Panel schließt sich bei Filter-Change (falls offen)

---

## 3. Inventur-Tabelle

**Spalten (v.l.n.r):**
1. **Name** (text-[12.5px] font-medium) - "Inventur Mai 2026"
2. **Lager** (text-[12.5px]) - "Küche"
3. **Artikel-Count** (text-[12.5px]) - "245"
4. **Abweichungen** (text-[12.5px]) - "12"
5. **Status** (Badge) - "Vorbereitung" / "Aktiv" (grün) / "Abgeschlossen" (blau)
6. **Verantwortlicher** (text-[12px]) - "Max Müller"
7. **Startdatum** (text-[11px]) - "31.05.2026 10:30"

**Row-Styling:**
- `h-10` Höhe
- Hover: `bg-muted/50 cursor-pointer`
- Click auf Row (außer Buttons) → öffnet Detail-Panel rechts
- Border-bottom: `border-b border-border/50`
- Selected Row: `bg-muted` (highlighted)

**Table-Header:**
- Background: `bg-muted/30`
- Text: `text-[11px] font-medium text-muted-foreground`
- Border-bottom: `border-b border-border/50`

**Empty State:**
- Wenn keine Inventuren für Filter: "Keine Inventuren in diesem Lager"

**Header-Bereich (über Tabelle):**
- `h-12` mit "Inventuren (X)" Count
- Rechts: **"+ Neue Inventur"** Button (bg-primary px-3 py-1.5 text-[12.5px] font-medium)
- Rechts auch: **Export-Button** (oder in Dropdown integriert)

---

## 4. Detail-Panel (Rechts)

**Layout:**
- `w-96` fixed width
- `h-full` scrollable wenn nötig
- Header: `h-12` mit Inventur-Name (text-sm font-semibold)

**Sections:**

### 4.1 Basis-Infos (Read-only)
```
Lager: Küche
Verantwortlicher: Max Müller
Startdatum: 31.05.2026 10:30
Enddatum: — (wenn aktiv) / 31.05.2026 16:00 (wenn abgeschlossen)
```

### 4.2 Metriken
```
Artikel gezählt: 233 / 245
Abweichungen: 12 Artikel
Euro-Wert (Soll): €4.532,50
Euro-Wert (Ist): €4.498,75
Differenz: -€33,75
```

### 4.3 Status (Badge)
```
Status: [Vorbereitung | Aktiv | Abgeschlossen]
```

### 4.4 Notizen/Beschreibung
```
Text mit Notizen (evtl. editable wenn Status=Vorbereitung)
```

**Divider** (`border-t border-border my-4`)

### 4.5 Sekundäre Aktionen (Buttons)
```
[Starten] - nur wenn Status = Vorbereitung, ändert zu Aktiv
[Abschließen] - nur wenn Status = Aktiv
[Archivieren] - nur wenn Status = Abgeschlossen
[Löschen] - destructive, mit Confirmation
[Export] - PDF/Excel dieser einen Inventur
```

**Styling:**
- Label: `text-[11px] font-medium text-muted-foreground mb-1`
- Werte: `text-[13px] text-foreground`
- Buttons: `h-8 text-[13px] rounded-md`
- Primary Button: `bg-primary text-primary-foreground hover:bg-primary/90`
- Secondary Button: `border border-border bg-background hover:bg-muted/60`
- Destructive Button: `border border-destructive text-destructive hover:bg-destructive/10`

**Empty State:**
- Wenn keine Inventur selected: "Wähle eine Inventur aus"

---

## 5. Dialog - Neue Inventur erstellen

**Trigger:** Click auf **"+ Neue Inventur"** Button (nur Schichtleiter & Admins)

**Dialog-Content:**

```
┌──────────────────────────────────────┐
│ Neue Inventur erstellen              │
├──────────────────────────────────────┤
│                                      │
│ Name / Titel                         │  (label: text-[11px] font-medium)
│ [______________________________]      │  (input: text-[13px] h-8)
│ (z.B. "Inventur Mai 2026")           │
│                                      │
│ Lager                                │
│ [Küche ▼]                            │  (select dropdown)
│                                      │
│ Verantwortlicher                     │
│ [Max Müller ▼]                       │  (select: alle Schichtleiter/Admins)
│                                      │
│ Notizen (optional)                   │
│ [________________________]            │  (textarea: text-[13px])
│                                      │
│           [Abbrechen] [Erstellen]    │
│                                      │
└──────────────────────────────────────┘
```

**Validierung:**
- Name erforderlich (non-empty)
- Lager erforderlich
- Verantwortlicher erforderlich
- Ungültig → Toast.error mit Grund

**Nach "Erstellen":**
- POST `zaehl_sessions` mit Name, Lager, Verantwortlicher, Status="Vorbereitung"
- Toast.success: "Inventur erstellt"
- Dialog schließt
- Neue Inventur erscheint in Tabelle (mit Status=Vorbereitung)
- Sidebar-Counts aktualisieren
- Detail-Panel zeigt neue Inventur sofort

**Styling:**
- Radix UI Dialog
- Overlay: `fixed inset-0 z-40 bg-black/40 backdrop-blur-sm`
- Content: `fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2`

---

## 6. Data Flow & Interactions

### 6.1 Initial Load
```
App.jsx loads currentUser (with tenantId expanded)
  ↓
InventurenPage → InventurenShell (QueryClientProvider wrapper)
  ↓
useQuery: pb.collection('zaehl_sessions')
  .getFullList({ filter: `standort = "${currentUser.tenantId}"`, sort: '-created' })
  ↓
State: inventuren, activeStorageFilter, selectedInventurId
```

### 6.2 Lager-Filter Click
```
Click Sidebar "Küche"
  ↓
setActiveStorageFilter('küche')
  ↓
useMemo: filter inventuren by lager
  ↓
Tabelle re-renders mit gefilterten Inventuren
  ↓
Sidebar-Counts aktualisieren
  ↓
Detail-Panel schließt sich (setSelectedInventurId(null))
```

### 6.3 Neue Inventur erstellen
```
Click "+ Neue Inventur"
  ↓
Dialog öffnet
  ↓
Input: Name, Lager, Verantwortlicher, Notizen
  ↓
Click "Erstellen" → POST zaehl_sessions
  ↓
Toast.success "Inventur erstellt"
  ↓
Dialog schließt, refetchInventuren(), neue Inventur in Tabelle
```

### 6.4 Row Click - Detail-Panel öffnen
```
Click auf Tabellenzeile (außer Buttons)
  ↓
setSelectedInventurId(inventurId)
  ↓
Detail-Panel öffnet rechts, zeigt volles Profil
```

### 6.5 Inventur Starten (Vorbereitung → Aktiv)
```
Click "Starten" im Detail-Panel
  ↓
PUT zaehl_sessions { status: 'aktiv', start_time: now() }
  ↓
Toast.success "Inventur gestartet"
  ↓
Detail-Panel & Tabelle aktualisieren, Status ändert sich zu "Aktiv" (grün)
```

### 6.6 Inventur Abschließen (Aktiv → Abgeschlossen)
```
Click "Abschließen" im Detail-Panel
  ↓
PUT zaehl_sessions { status: 'abgeschlossen', end_time: now() }
  ↓
Metriken berechnen (Artikel-Count aus zaehlung_aktuell Collection)
  ↓
Toast.success "Inventur abgeschlossen"
  ↓
Row wechselt zu Status=Abgeschlossen (blau)
  ↓
"Archivieren" Button wird aktiv
```

### 6.7 Inventur Archivieren (→ inventur_archiv)
```
Click "Archivieren" im Detail-Panel
  ↓
POST inventur_archiv (Kopie aller Daten aus zaehl_sessions + finalen Metriken)
  ↓
DELETE zaehl_sessions (oder Archive-Flag setzen)
  ↓
Toast.success "Inventur archiviert"
  ↓
Tabelle refreshed, Inventur verschwindet aus aktiven Listen
```

### 6.8 Export (PDF/Excel/CSV)
```
Click Export-Button (oben rechts in Header)
  ↓
Dialog oder Dropdown mit Format-Optionen: PDF, Excel, CSV
  ↓
Je nach Format:
  - PDF: Generiere Bericht mit:
    - Titel, Lager, Verantwortlicher, Startdatum
    - Metriken (Artikel-Count, Abweichungen, Euro-Werte)
    - Artikel-Liste mit Abweichungen
    - Status & Notizen
  - Excel/CSV: Tabelle mit allen Spalten
  ↓
Download startet (in Browser)
  ↓
Toast.info "Export heruntergeladen"
```

**Oder:** Export auf einzelner Inventur im Detail-Panel:
```
Click "Export" im Detail-Panel
  ↓
Dialog: Format wählen (PDF / Excel / CSV)
  ↓
Export nur diese eine Inventur (statt alle gefilterten)
```

### 6.9 Real-time Updates (Subscriptions)
```
useEffect: Subscribe zu zaehl_sessions Collection
  ↓
Bei Änderung (von anderen Usern, oder von Index HTML):
  ↓
Refetch Inventuren & aktualisiere Tabelle sofort
  ↓
Wenn selected Inventur sich ändert: Detail-Panel aktualisiert
```

### 6.10 Error Handling
- Netzwerkfehler → Toast.error "Fehler beim Laden"
- Validation Error → Toast.error mit Grund
- Permission Denied → Toast.error "Keine Berechtigung für diese Aktion"
- Duplicate Name → Toast.error "Name existiert bereits"

---

## 7. Berechtigungen & Sichtbarkeit

**Nur für diese View sichtbar:**
- Schichtleiter (mit `userCan(currentUser, 'inventur')`)
- Admins

**Normale Mitarbeiter:**
- Können diese Seite nicht sehen (nicht in Navigation)
- Sehen nur die Index HTML Zähler-Interface

**Was Schichtleiter können:**
- Alle Aktionen: Erstellen, Starten, Abschließen, Archivieren, Exportieren
- Nur ihre Inventuren verwalten (oder alle, je nach Config)

**Was Admins können:**
- Alle Aktionen
- Alle Inventuren aller Schichtleiter sehen & verwalten
- Löschen-Button verfügbar

---

## 8. Master-Template Konsistenz

✅ **3-Spalten-Layout:** Sidebar (220px) | Content (flex) | Detail (300px)
✅ **Headers:** Alle `h-12`, konsistente Padding (px-3 py-2)
✅ **Typography:** text-sm für Headers, text-[12.5px] für Standard, text-[11px] für Labels
✅ **Farb-Semantik:** CSS-Variablen (background, foreground, muted-foreground, border, primary, destructive)
✅ **Spacing:** py-1.5 für Rows, gap-2 für Standard
✅ **Buttons:** h-8, px-3, text-[12.5px]
✅ **Hover-States:** `hover:bg-muted/50` auf Rows
✅ **Badges:** Status-Badges mit Farben (grün=aktiv, blau=abgeschlossen)

---

## 9. Index HTML (Nicht angefasst!)

Die existierende **Index HTML / Zähler-Interface** bleibt UNVERÄNDERT:
- Barcode-Scanning
- CountingCommandPalette
- InventurDashboard
- Real-time Zählungen (zaehlung_aktuell)
- Export-Funktionalität (bleibt erhalten)

Diese neue Backend-Seite ist nur für **Admin-Management**, nicht für Zähler.

---

## 10. Metriken & Berechnungen

**Artikel-Count:**
- Aus `zaehlung_aktuell` Collection für diese Inventur
- Format: "233 / 245" (gezählt / gesamt)

**Abweichungen:**
- Artikel wo Ist ≠ Soll
- Format: "12 Artikel"
- Clickbar im Detail-Panel um Details zu sehen (future)

**Euro-Werte:**
- Soll: Summe aller Artikel × aktueller Preis
- Ist: Summe aller gezählten Artikel × aktueller Preis
- Differenz: Ist - Soll (kann negativ sein)
- Format: EUR mit 2 Dezimalen

---

## 11. Future Enhancements (Out of Scope)

- Detail-View für Abweichungen (welche Artikel fehlen/zuviel)
- Lager-Zuweisung mehrerer Schichtleiter zu einer Inventur
- Permissions Granularität (user kann nur seine Inventuren sehen)
- Revision-History (wer hat was wann geändert)
- Bulk-Archivieren (mehrere Inventuren gleichzeitig)
