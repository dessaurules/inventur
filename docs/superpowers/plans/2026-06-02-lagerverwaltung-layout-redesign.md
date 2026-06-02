# Lagerverwaltung Layout-Redesign – 3-spaltige Struktur

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umstrukturiere die Lagerverwaltung von 2-spaltig (Sidebar + Details) auf 3-spaltig (Lager-Liste | Lager+Unterlager+Mitarbeiter | Artikel), mit exakter Anpassung an Design Master Template.

**Architecture:** 
- Left: Sidebar (220px) mit Lager-Liste + Drag-and-Drop
- Middle: Haupt-Content (flex-1) mit Lagername, Mitarbeiter-Zuordnung, Unterlager, Footer-Buttons
- Right: Artikel-Spalte (340px) statt Lager-Übersicht
- Alle Header h-12 (48px), Typografie nach Master-Template, Farb-Semantik konsistent

**Tech Stack:** React, Tailwind CSS, @dnd-kit, lucide-react, PocketBase SDK

---

## File Structure

**Zu modifizieren:**
- `src/components/LagerverwaltungSection.jsx` — Komplette Layout-Umstrukturierung (Zeilen ~820–1370)
  - Render-Logik für 3-spaltige Layout
  - Header-Höhen standardisieren auf h-12
  - Typografie und Spacing nach Master-Template
  - Artikel-Spalte (aktuelle `RECHTE SPALTE: Artikel` ist schon vorhanden, muss nur repositioniert werden)

**Keine neuen Dateien.** Nur Restrukturierung der bestehenden Komponente.

---

## Task 1: Layout-Container vorbereiten (h-full flex-Layout)

**Files:**
- Modify: `src/components/LagerverwaltungSection.jsx:820–830` (main div vor den tab-Renderern)

- [ ] **Step 1: Überprüfe den Main-Container**

Öffne `src/components/LagerverwaltungSection.jsx` und suche die Zeile mit:
```jsx
{activeTab === 'lager' ? (
  <div className={cn(
```

Das ist der Container für die 3-spaltige Layout (aktuell wahrscheinlich noch nicht richtig strukuriert).

- [ ] **Step 2: Ändere Main-Container auf 3-spaltige Struktur**

Ersetze den Main-Wrapper (der aktuelle Container für Sidebar+Content) mit:
```jsx
{activeTab === 'lager' ? (
  <div className="flex min-h-0 flex-1 bg-background">
    {/* Sidebar wird hier platziert */}
    {/* Content wird hier platziert */}
    {/* Artikel-Spalte wird hier platziert */}
  </div>
) : null}
```

Stelle sicher, dass die drei Spalten nebeneinander liegen mit:
- `flex` (horizontal flow)
- `min-h-0` (erlaubt overflow-y: auto)
- `flex-1` auf dem äußeren Wrapper

---

## Task 2: Sidebar mit Lager-Liste neu strukturieren

**Files:**
- Modify: `src/components/LagerverwaltungSection.jsx` — Sidebar-Render (~Zeilen 820–950)

- [ ] **Step 1: Sidebar-Struktur überprüfen**

Die Lager-Liste sitzt aktuell im Seitenbalken. Überprüfe, dass diese Struktur vorhanden ist:
- `<aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">`
  - Header (h-12) mit "Lager" Titel
  - Lager-Liste (flex-1, overflow-y-auto)
    - SortableLagerRow Items mit Drag-and-Drop

**Keine Änderung nötig** — die Sidebar existiert bereits und funktioniert. Nur sicherstellen, dass `h-full` und `w-[220px]` gesetzt sind.

- [ ] **Step 2: Suchfeld entfernen (falls noch vorhanden)**

Wenn es einen `.sidebar-search-container` gibt, entferne ihn:
```jsx
// ❌ ENTFERNEN:
{/* <div className="px-3 py-2 border-b border-border">
  <input ... />
</div> */}
```

---

## Task 3: Middle-Content-Spalte strukturieren

**Files:**
- Modify: `src/components/LagerverwaltungSection.jsx` — Content-Area (~Zeilen 950–1250)

- [ ] **Step 1: Header überprüfen (h-12 Standard)**

Der Content-Header sollte sein:
```jsx
<div className="flex h-12 shrink-0 items-center border-b border-border px-3 py-2">
  <span className="text-sm font-semibold text-foreground">Küche verwalten</span>
</div>
```

Stelle sicher:
- `h-12` ist gesetzt (nicht h-auto oder andere Höhe)
- `px-3 py-2` Padding
- `text-sm font-semibold` Typography

**Aktueller Code prüfen:** Falls der Header anders aussieht (z.B. h-auto oder andere Höhe), anpassen auf h-12.

- [ ] **Step 2: Content-Body neu strukturieren (scrollable sections)**

Der Body sollte sein:
```jsx
<div className="min-h-0 flex-1 overflow-y-auto">
  <div className="flex flex-col gap-6 p-6">
    {/* Lagername Sektion */}
    {/* Mitarbeiter Sektion */}
    {/* Unterlager Sektion */}
    {/* Footer Buttons */}
  </div>
</div>
```

Stelle sicher:
- `min-h-0 flex-1 overflow-y-auto` für scrollbares Content
- Innerer Div mit `flex flex-col gap-6 p-6` für Spacing

- [ ] **Step 3: Lagername-Sektion (Textfeld)**

Diese Sektion sollte sehr einfach sein:
```jsx
<div>
  <label className="mb-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    Lagername
  </label>
  <input
    type="text"
    value={selectedLager?.name ?? ''}
    onChange={(e) => {/* handle change */}}
    className="h-9 w-full rounded-md border border-input bg-background px-3 text-[12.5px]"
    placeholder="Lagername"
  />
</div>
```

**Typography nach Master-Template:**
- Label: `text-[11px] font-medium uppercase tracking-wide text-muted-foreground`
- Input: `text-[12.5px]`

- [ ] **Step 4: Mitarbeiter-Zuordnung (Select + Liste)**

Struktur:
```jsx
<div>
  <label className="mb-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    Mitarbeiter
  </label>
  <div className="mb-3 flex gap-2">
    <select className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-[12.5px]">
      {/* Options */}
    </select>
    <button className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] hover:bg-muted">
      + Hinzufügen
    </button>
  </div>
  <ul className="flex flex-col gap-0.5 rounded-md border border-border">
    {mitarbeiterList.map((m) => (
      <li key={m.id} className="flex items-center justify-between px-3 py-2 text-[12.5px] hover:bg-muted">
        <span>{m.name}</span>
        <button className="text-muted-foreground opacity-0 hover:text-destructive hover:opacity-100">
          ✕
        </button>
      </li>
    ))}
  </ul>
</div>
```

**Details:**
- Label: Master-Template Standard (11px uppercase)
- Select/Button: h-9, text-[12.5px]
- Liste: `flex flex-col gap-0.5`, items `py-2`

- [ ] **Step 5: Unterlager-Sektion (mit Drag-and-Drop)**

Diese Sektion nutzt existierende DndContext. Struktur:
```jsx
<div>
  <label className="mb-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    Unterlager ({unterlagerList.length})
  </label>
  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onUnterlagerDragEnd}>
    <SortableContext items={unterlagerList.map(u => u.id)} strategy={verticalListSortingStrategy}>
      <ul className="flex flex-col gap-0.5 rounded-md border border-border mb-2">
        {unterlagerList.map((u) => (
          <SortableUnterlagerRow
            key={u.id}
            unterlager={u}
            onDelete={handleUnterlagerDelete}
          />
        ))}
      </ul>
    </SortableContext>
  </DndContext>
  <button className="w-full rounded-md border border-input bg-background px-3 py-2 text-[12.5px] hover:bg-muted">
    + Unterlager hinzufügen
  </button>
</div>
```

**Drag-and-Drop existiert bereits**, muss nur in die neue Struktur integriert werden.

- [ ] **Step 6: Footer-Buttons (Löschen, Archivieren, Speichern)**

Am Ende der Content-Body div:
```jsx
<div className="flex gap-2 border-t border-border pt-4">
  {dirty ? (
    <span className="mr-auto self-center text-[12px] text-muted-foreground">
      Nicht gespeicherte Änderungen
    </span>
  ) : null}
  <button className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] hover:bg-muted">
    Löschen
  </button>
  <button className="h-9 rounded-md border border-input bg-background px-3 text-[12.5px] hover:bg-muted">
    Archivieren
  </button>
  <button className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90">
    Speichern
  </button>
</div>
```

**Spacing:** `pt-4` oben (border-top), `gap-2` zwischen Buttons

- [ ] **Step 7: Commit**

```bash
git add src/components/LagerverwaltungSection.jsx
git commit -m "refactor: restructure lagerverwaltung to 3-column layout (left: lager, middle: mitarbeiter/unterlager, right: artikel)"
```

---

## Task 4: Artikel-Spalte (rechts) repositionieren

**Files:**
- Modify: `src/components/LagerverwaltungSection.jsx` — Artikel-Spalte (~Zeilen 1329–1370)

- [ ] **Step 1: Artikel-Spalte prüfen**

Die Artikel-Spalte existiert bereits, sitzt aber aktuell rechts neben der Lager-Übersicht. Überprüfe die Struktur:
```jsx
<div className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border-l border-border bg-background">
  <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
    <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
      Artikel ({lagerArticles.length})
    </p>
  </header>
  <div className="min-h-0 flex-1 overflow-y-auto">
    {/* Article list */}
  </div>
</div>
```

- [ ] **Step 2: Änderung auf h-12 Header (von 48px)**

Der Header ist zu klein (derzeit py-1.5). Anpassen auf Master-Template Standard:
```jsx
<header className="flex h-12 shrink-0 items-center border-b border-border px-3 py-2">
  <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
    Artikel ({lagerArticles.length})
  </p>
</header>
```

Änderungen:
- `h-12` explizit setzen (statt immer auto)
- `py-2` für konsistentes Padding

- [ ] **Step 3: Artikel-Items überprüfen**

Die Items sollten sein:
```jsx
<li className="flex items-center gap-3 border-b border-border px-3 py-2 text-[12.5px] hover:bg-muted">
  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
    {a.einheit}
  </span>
  <span className="shrink-0 whitespace-nowrap text-[11px] font-tabular-nums text-muted-foreground">
    {Number(a.preis).toFixed(2)}€
  </span>
</li>
```

**Details:**
- `py-2` Padding konsistent mit anderen Rows
- Name: `text-[12.5px] font-medium`
- Unit + Preis: `text-[11px]`
- `gap-3` zwischen Name und Meta

- [ ] **Step 4: No-Selection Empty State**

Wenn kein Lager ausgewählt:
```jsx
{!selectedLager ? (
  <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-muted-foreground">
    Wähle ein Lager aus der Liste.
  </div>
) : (
  <>
    {/* Header + Article List */}
  </>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/LagerverwaltungSection.jsx
git commit -m "refactor: reposition artikel column to right, standardize headers to h-12"
```

---

## Task 5: Layout-Integration testen

**Files:**
- Test: `src/components/LagerverwaltungSection.jsx` vollständig

- [ ] **Step 1: Dev-Server starten**

```bash
cd ~/Projects/vibe-inventur
npm run dev
```

Browser: `http://localhost:5173`

- [ ] **Step 2: Navigiere zu Lagerverwaltung → Lager-Tab**

- [ ] **Step 3: Visuelle Überprüfung (3-spaltig)**

Checklist:
- ✓ Links: Lager-Liste 220px breit, "Lager" Header h-12
- ✓ Mitte: Lagername, Mitarbeiter, Unterlager, Buttons — scrollbar vorhanden
- ✓ Rechts: Artikel-Liste 340px breit, Header h-12
- ✓ Alle Header gleich hoch (h-12 = 48px)
- ✓ Spacing konsistent (gap-6 sections, py-2 rows)
- ✓ Farben/Text: Master-Template Standard

- [ ] **Step 4: Interaktivität prüfen**

- Wähle verschiedene Lager aus (Lagerekliste Links)
- Überprüfe: Mitarbeiter ändern sich, Unterlager ändern sich, Artikel-Liste updated
- Drag-and-Drop Lager: funktioniert noch?
- Drag-and-Drop Unterlager: funktioniert noch?
- Delete-Buttons (hover-only): tauchen auf bei Hover?

- [ ] **Step 5: Browser Console**

F12 → Console: **Keine Fehler** sollten angezeigt werden.

- [ ] **Step 6: Responsive Check**

- Verkleinere Browser-Fenster (z.B. auf 1200px Breite)
- Überprüfe: Layout bricht nicht zusammen, Sidebar bleibt sichtbar
- (Hinweis: `max-[1180px]:hidden` auf Artikel-Spalte könnte verstecken, wenn gewünscht)

- [ ] **Step 7: Commit**

```bash
git add src/components/LagerverwaltungSection.jsx
git commit -m "test: verify 3-column layout works, all interactions functional"
```

---

## Self-Review

✅ **Spec Coverage:**
- 3-spaltig Layout (Lager | Lager+Unterlager+Mitarbeiter | Artikel) ✓
- Design Master Template (h-12 headers, text-[12.5px] standard, gaps, py-2 rows) ✓
- Artikel-Spalte repositioniert (rechts statt Lager-Übersicht) ✓
- Mitarbeiter-Zuordnung + Unterlager im Middle bleibt ✓
- Drag-and-Drop funktioniert noch ✓

✅ **Konsistenz mit Master-Template:**
- Header h-12 (48px) überall ✓
- Sidebar 220px + Content flex-1 + Detail 340px ✓
- Label uppercase 11px, normal text 12.5px ✓
- Spacing: gap-6 sections, py-2 rows, px-3 cols ✓
- Farb-Semantik: foreground, muted-foreground, border, muted, primary, destructive ✓

✅ **Keine neuen Abhängigkeiten:**
- Alle Icons/Utilities bereits vorhanden (GripVertical, Trash2, cn, DndContext) ✓
- Keine breaking changes zu anderen Features ✓

---

## Post-Implementation Verification

Nach allen Tasks:
1. Checke Browser Console (keine Fehler)
2. Teste alle User-Flows (select lager, assign mitarbeiter, add/delete unterlager, view artikel)
3. Vergleiche mit Master-Template visuell
4. Merke Deviationen für zukünftige Updates
