# Master Template – Einheitliches Design-System

**Status:** Master-Template für alle Backend-Seiten (Magazin, Lagerverwaltung, Inventur, Mitarbeiter)  
**Basis:** Magazin-Seite (produktionsreife Referenz)  
**Version:** 1.0  
**Datum:** 2026-05-31

---

## Grundprinzipien

Alle Backend-Seiten folgen einem **einheitlichen Layout-Pattern**, um ein kohärentes, professionelles Design zu schaffen. Die Funktionalität kann unterschiedlich sein, aber die visuelle Struktur und Typografie bleiben konsistent.

---

## 1. Seiten-Architektur

### Allgemeiner Aufbau

```
┌────────────────────────────────────────────────────────────────┐
│ App-Header (Global Navigation)                                 │
│ [Inventur] [Lagerverwaltung] [Magazin] [Mitarbeiter]          │
├────────┬──────────────────────────┬───────────────────────────┤
│        │                          │                           │
│ Sidebar│ Content-Bereich (Main)   │ Detail-Bereich (Optional)│
│        │                          │                           │
│ Filter │ Tabelle/Liste            │ Bearbeitung / Detail-View │
│ Navi   │ + Toolbar                │                           │
│        │                          │                           │
└────────┴──────────────────────────┴───────────────────────────┘
```

### Breiten

- **Sidebar:** `w-[220px]` (fest)
- **Content:** `flex-1` (flexibel, füllt verfügbarer Platz)
- **Detail-Bereich:** `w-96` (380px, fest) – nur wenn aktiv

### Höhen

- **App-Header:** 3.5rem (global, außerhalb der Seite)
- **Spalten-Header:** `h-12` (konsistent auf allen Seiten)
- **Rows/Items:** mind. 36px (für Virtualisierung: `estimateSize: 36`)

---

## 2. Typografie-Hierarchie

Alle Größen in Tailwind-Klassen (CSS-Variablen wo möglich):

| Ebene | Klasse | Gewicht | Verwendung |
|-------|--------|---------|-----------|
| **1 – Haupt-Header** | `text-sm font-semibold` | 600 (semibold) | Spalten-Titel ("Kategorien", "Alle", "Neuer Artikel") |
| **2 – Standard-UI** | `text-[12.5px]` | 400 (normal) | Button-Labels, List-Items, normale UI |
| **2b – Aktiv/Fokus** | `text-[12.5px] font-medium` | 500 (medium) | Aktive Buttons, ausgewählte Zeilen |
| **3 – Sekundär** | `text-[12px]` | 400 (normal) | Labels, Attribut-Werte, Nebentexte |
| **4 – Sehr klein** | `text-[11px]` | 600 (semibold) | Section-Labels (uppercase: "KATEGORIEN", "SMART-LISTEN") |
| **Mono (Zahlen)** | `font-mono text-[12px] tabular-nums` | 400 (normal) | Nummern, Preise, Codes (gleiche Breite) |

### Schriftarten

- **Serifenlos (Standard):** Tailwind Default (Inter, Roboto, etc.)
- **Monospace:** `font-mono` für Nummern/Codes

---

## 3. Spalten-Header (Konsistent `h-12`)

Alle drei Spalten-Header haben die gleiche Höhe und Struktur:

```jsx
// Sidebar Header (z.B. "Kategorien")
<div className="flex h-12 items-center border-b border-border px-3">
  <span className="text-sm font-semibold text-foreground">Kategorien</span>
</div>

// Content Header (z.B. "Alle (142)")
<header className="flex h-12 items-center gap-2 border-b border-border px-3">
  <div className="text-sm font-semibold text-foreground">
    Alle <span className="text-muted-foreground">(142)</span>
  </div>
  {/* Buttons, Toolbar rechts */}
</header>

// Detail Header (z.B. "Neuer Artikel" + X)
<header className="flex h-12 items-center gap-2 border-b border-border px-3">
  <div className="text-sm font-semibold text-foreground">
    Neuer Artikel <span className="text-[12px] text-muted-foreground">#ART-001</span>
  </div>
  <button>✕</button>
</header>
```

**Wichtig:**
- `h-12` + `flex items-center` für vertikale Zentrierung
- `border-b border-border` für Trennlinie
- `px-3 py-2` für Padding
- Nie `h2`, `h3` Tags verwenden (verwende `div` um Browser-Defaults zu vermeiden)
- Nie `flex-wrap` (kann Header-Höhe verändern)

---

## 4. Farb-Semantik (CSS-Variablen)

Nutze konsistent Tailwind-Semantik:

| Variable | Verwendung |
|----------|-----------|
| `bg-background` | Seiten-Hintergrund, Button-Grundfarbe |
| `text-foreground` | Standard-Textfarbe |
| `text-muted-foreground` | Sekundär-Text, Labels, Nummern |
| `border-border` | Alle Linien (Header, Rows) |
| `bg-muted` | Hover-Hintergrund, inaktive Bereiche |
| `bg-primary` | Primär-Buttons, aktive States |
| `text-primary-foreground` | Text auf primären Buttons |
| `bg-destructive` | Delete/Remove Buttons |
| `text-destructive` | Fehler-Meldungen |

---

## 5. Spacing-Standard

### Padding

- **Horizontal:** `px-3` (standard)
- **Vertikal:** `py-2` (Header), `py-1.5` (Rows)

### Gap

- **Zwischen Elementen:** `gap-2` oder `gap-1.5`
- **Zwischen Sections:** `gap-3`

### Höhen (Rows)

- **Tabellen-Rows:** mindestens `py-1.5` (= ~36px total mit Text)
- **Buttons:** `h-8` (für inline Buttons in Headers)

---

## 6. Komponenten-Patterns

### Buttons

**Primär (z.B. "+ Artikel"):**
```jsx
<button className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
  <Plus className="h-3.5 w-3.5" />
  Artikel
</button>
```

**Sekundär (z.B. "Import"):**
```jsx
<button className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12.5px] hover:bg-muted">
  <FileText className="h-3.5 w-3.5" />
  PDF
</button>
```

### List-Items / Rows

```jsx
<div className="grid grid-cols-[2rem_5.5rem_minmax(0,1fr)_auto_auto] gap-2 items-center border-b border-border px-3 py-1.5 text-[12.5px] hover:bg-muted/50 cursor-pointer">
  <div>☐</div> {/* Checkbox */}
  <div className="font-mono text-[12px] text-muted-foreground">ART-001</div>
  <div className="truncate font-medium">Artikel Name</div>
  <div className="text-[12px] text-muted-foreground">Stk</div>
  <div className="font-mono text-[12px]">2,50 €</div>
</div>
```

### Labels / Filter-Buttons

```jsx
<button className="px-2 py-1.5 rounded text-[12.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
  📁 Kategorie Name
</button>

// Aktiv:
<button className="px-2 py-1.5 rounded text-[12.5px] font-medium bg-muted text-foreground">
  📁 Aktive Kategorie
</button>
```

---

## 7. Interaktions-Patterns

### Hover-States

- **Buttons:** `hover:opacity-90` oder `hover:bg-muted`
- **Rows:** `hover:bg-muted/50`
- **Labels:** `hover:bg-muted/60`

### Active-States

- **Ausgewählte Zeilen:** `bg-muted` mit linkem Border `border-l-2 border-l-primary`
- **Aktive Filter:** `bg-muted` + `font-medium`

### Fokus-States

```jsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
```

---

## 8. Sidebar-Pattern

```jsx
<aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-background">
  {/* Header */}
  <div className="flex h-12 items-center border-b border-border px-3">
    <span className="text-sm font-semibold text-foreground">Kategorien</span>
  </div>

  {/* Navigation/Filter */}
  <nav className="flex-1 overflow-y-auto p-2 space-y-2">
    {/* Items */}
  </nav>
</aside>
```

**Charakteristiken:**
- Fest 220px breit
- Scroll bei Bedarf
- Header h-12
- Sektion-Labels in `text-[11px] uppercase font-semibold`

---

## 9. Content-Bereich-Pattern

```jsx
<div className="flex flex-1 flex-col">
  {/* Header */}
  <header className="flex h-12 items-center border-b border-border px-3">
    <div className="flex-1">
      <div className="text-sm font-semibold">Title ({count})</div>
    </div>
    {/* Buttons / Toolbar */}
  </header>

  {/* Toolbar (Suche, Sortierung) */}
  <div className="border-b border-border px-3 py-2">
    {/* Filter-Controls */}
  </div>

  {/* List/Tabelle */}
  <div className="flex-1 overflow-auto">
    {/* Virtualisierte Rows oder normale Items */}
  </div>
</div>
```

---

## 10. Detail-Bereich-Pattern

```jsx
<aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background">
  {/* Header */}
  <header className="flex h-12 items-center gap-2 border-b border-border px-3">
    <div className="flex-1">
      <div className="text-sm font-semibold">Item Name</div>
    </div>
    <button>✕</button>
  </header>

  {/* Scroll-Content */}
  <div className="flex-1 overflow-y-auto p-3">
    {/* Form, Details, etc. */}
  </div>
</aside>
```

**Responsive:**
- Desktop (1180px+): Fest rechts
- Mobile (<1180px): `fixed inset-y-0 right-0 z-40 shadow-xl` (Modal)

---

## 11. Fehlerbehandlung & Toasts

- **Fehler-Banner:** `bg-destructive/10` + `text-destructive`
- **Toast-Komponente:** `sonner` Library
  - Success: `toast.success("Erfolg")`
  - Error: `toast.error("Fehler")`
  - Message: `toast.message("Info")`

---

## 12. Icons

- **Library:** `lucide-react`
- **Größen:**
  - In Buttons: `h-3.5 w-3.5`
  - In Headers: `h-4 w-4`
  - In Rows: `h-3.5 w-3.5`
- **Farbe:** Erben von Parent (opacity adjustable mit `opacity-80`)

---

## 13. Tastatur-Navigation

Alle Seiten sollten unterstützen:

- `⌘K` oder `/` – Command Palette / Suche
- `ESC` – Drawer/Modal schließen
- `N` – Neuer Eintrag
- `J` / `K` – Nächstes/Vorheriges Item
- `Shift+Click` – Bereichs-Auswahl
- `Tab` – Standard-Navigation

---

## Anwendung auf andere Seiten

Beim Aufbau von **Lagerverwaltung, Inventur, Mitarbeiter:**

1. ✅ Nutze das gleiche **3-Spalten-Layout** (Sidebar + Content + Detail)
2. ✅ **Header h-12** konsistent auf allen Spalten
3. ✅ **Typografie-Hierarchie** exakt wie oben
4. ✅ **Farb-Semantik** durchgehend nutzen
5. ✅ **Spacing-Standard** befolgen
6. ✅ **Icon-Größen** konsistent
7. ✅ **Hover/Active-States** identisch

**Abweichungen nur wenn:**
- Die Funktionalität explizit etwas anderes erfordert
- Ist dokumentiert und bewusst entschieden

---

## Datei-Struktur

```
src/backend/
├── magazin/                    ← Master-Template Referenz
│   ├── MagazinPage.jsx
│   ├── magazin-shell.jsx
│   ├── article-list.jsx
│   ├── detail-drawer.jsx
│   └── sidebar-categories.jsx
├── lagerverwaltung/            ← Nutzt Master-Template
├── inventur/                   ← Nutzt Master-Template
└── mitarbeiter/                ← Nutzt Master-Template
```

---

## Changelog

| Version | Datum | Änderung |
|---------|-------|----------|
| 1.0 | 2026-05-31 | Initial – basierend auf Magazin-Seite (produktionsreif) |
