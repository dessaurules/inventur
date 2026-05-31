# Mitarbeiterübersicht (Admin-Seite) – Design

> **Für agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin/Manager können alle Mitarbeiter eines Standorts verwalten — Rollen ändern, Lager zuweisen, neue Mitarbeiter einladen, Benutzerkonten deaktivieren/aktivieren.

**Architecture:** 3-Spalten-Layout (Master-Template): Sidebar (Rollen-Filter) | Tabelle (Mitarbeiter mit Inline-Aktionen) | Detail-Panel (vollständige Infos + sekundäre Aktionen).

**Tech Stack:** React, Vite, PocketBase (users, user_invites, user_lager Collections), TailwindCSS.

---

## 1. Architektur & File-Struktur

**Neue Ordner & Dateien:**
- `src/backend/mitarbeiter/` (parallel zu `src/backend/magazin/`)
  - `MitarbeiterPage.jsx` (Entry point, QueryClientProvider-Wrapper)
  - `mitarbeiter-shell.jsx` (Main State Container, Daten-Laden, Filtering)
  - `sidebar-roles.jsx` (Rollen-Filter-Sidebar)
  - `employee-table.jsx` (Tabelle mit allen Spalten + Inline-Dropdowns)
  - `invite-dialog.jsx` (Dialog zum Einladen neuer Mitarbeiter)
  - `employee-detail.jsx` (Detail-Panel rechts)
  - `types.js` (Utilities, mapPbRecordToEmployee, etc.)

**Routing:**
- Route: `/backend/mitarbeiter` (oder ähnlich, je nach Routing-Setup)
- Nur Admins (mit `manageUsers` capability) haben Zugriff

---

## 2. Sidebar (Rollen-Filter)

**Layout:**
- `w-[220px]` fixed width (Master-Template konsistent)
- `h-12` Header mit Label "Rollen"
- Filter-Buttons:
  - "Alle" (Standard active)
  - "Admins"
  - "Schichtleiter"
  - "Mitarbeiter"
  - Jeder Button zeigt Count in Klammern: "Alle (42)"

**Styling:**
- Active Button: `bg-muted font-medium text-foreground`
- Inactive: `text-muted-foreground hover:bg-muted/60`
- Text-Größe: `text-[12.5px]`
- Click → `setActiveRoleFilter(role)` → Tabelle re-filtered

**Behavior:**
- Click auf "Admins" → Tabelle zeigt nur Admins
- Click auf "Alle" → Tabelle zeigt alle (für diesen Standort)

---

## 3. Mitarbeiter-Tabelle

**Spalten (v.l.n.r):**
1. **Name** (text-[12.5px], font-medium) — "Anna Schmidt"
2. **E-Mail** (text-[12.5px]) — "anna@brauhaus.de"
3. **Rolle** (Inline `<select>` Dropdown)
   - Options: "Mitarbeiter" / "Schichtleiter" / "Admin"
   - onChange → sofort speichern zu PocketBase (PUT users/{id})
   - onClick stopPropagation (verhindert Row-Selection)
4. **Lager** (Button "Zuweisen")
   - Click → Modal mit Checkboxes (Küche, Restaurant, Brauerei)
   - speichert zu `user_lager` Collection
   - onClick stopPropagation
5. **Status** (Badge)
   - "Aktiv" (grün/primary) oder "Inaktiv" (grau/muted)
6. **Zuletzt aktiv** (text-[12px]) — "vor 2h", "vor 3 Tagen"
7. **Erstellt** (text-[11px], muted-foreground) — "15.05.2026"

**Row-Styling:**
- Row-Height: `h-10` (konsistent mit Master-Template)
- Hover: `bg-muted/50 cursor-pointer`
- Click auf Row (außer Dropdowns) → öffnet Detail-Panel rechts mit diesem Mitarbeiter
- Border-bottom: `border-b border-border/50`

**Header:**
- `h-12` (Master-Template)
- Links: "Mitarbeiter" + Count: "(42)"
- Rechts: `+ Mitarbeiter` Button + Suchfeld

**Suchfeld & Filter:**
- Input top-right: "Suchen…" (optional, kann später hinzugefügt werden)
- Filters aktuell: nur Rollen-Sidebar

---

## 4. Dialog: Mitarbeiter einladen

**Trigger:** Button "+ Mitarbeiter" oben rechts in der Tabelle

**Dialog-Content:**

```
┌──────────────────────────────────────┐
│ Mitarbeiter einladen                 │  (h2, font-semibold)
├──────────────────────────────────────┤
│                                      │
│ E-Mail                               │  (label: text-[11px] font-medium)
│ [input: max.muster@example.com]      │  (text-[13px], h-8)
│                                      │
│ Rolle                                │
│ [Dropdown: Mitarbeiter (default)]    │  (options: MA / SL / Admin)
│                                      │
│ ☑ Sofort Lager zuweisen              │  (optional checkbox)
│ [Lager-Checkboxes wenn checked]      │
│ ☐ Küche ☐ Restaurant ☐ Brauerei    │
│                                      │
│           [Abbrechen] [Einladen]     │  (Buttons rechts)
│                                      │
└──────────────────────────────────────┘
```

**Behavior:**
1. Admin klickt "+ Mitarbeiter"
2. Dialog öffnet sich
3. E-Mail eingeben (validation: basic email format)
4. Rolle wählen (default: "Mitarbeiter")
5. Optional: Lager-Checkboxes (wenn "Sofort Lager zuweisen" checked)
6. Click "Einladen":
   - POST zu `user_invites` Collection mit:
     - `email`
     - `role` (z.B. "mitarbeiter")
     - `tenant_id` (aktueller Standort des Admins)
     - `assigned_lager` (Array von Lager-IDs, falls checkbox checked)
   - Toast.success: "Einladung gesendet an max.muster@example.com"
   - Dialog schließt
   - Tabelle re-rendered (falls neuer User sofort sichtbar)

**Error Handling:**
- Ungültige E-Mail → Toast.error "Ungültige E-Mail-Adresse"
- E-Mail existiert bereits → Toast.error "Mitarbeiter existiert bereits"
- Netzwerkfehler → Toast.error "Einladung konnte nicht gesendet werden"

---

## 5. Detail-Panel (Rechts)

**Trigger:** Click auf eine Tabellenzeile → Panel öffnet rechts

**Layout:**
- `w-96` fixed width
- `h-full` height
- Scrollbar wenn Content länger als Screen
- Header: `h-12` mit Name des Mitarbeiters (text-sm font-semibold)

**Sections (von oben nach unten):**

### 5.1 Basis-Infos (read-only)
```
E-Mail
anna@brauhaus.de

Registriert am
15. Mai 2026, 10:30 Uhr

Zuletzt aktiv
Vor 2 Stunden
```

### 5.2 Rolle (editable)
```
Rolle
[Dropdown: Mitarbeiter / Schichtleiter / Admin]
(onChange → sofort PUT users/{id})
```

### 5.3 Zugewiesene Lager
```
Zugewiesene Lager
☑ Küche
☑ Restaurant
☐ Brauerei
(onChange → sofort PUT/POST user_lager)
```

### 5.4 Status
```
Status
◉ Aktiv
○ Inaktiv
(onChange → sofort PUT users/{id}, field: active)
```

### 5.5 Sekundäre Aktionen (unten, mit Divider oben)
```
─────────────────────────
Berechtigungen (Advanced)
[Button] → opens permissions dialog (future feature)

Passwort zurücksetzen
[Button] → sends reset link via email

Benutzer deaktivieren
[Button destructive] → Dialog bestätigung → deaktiviert
```

**Styling:**
- Label: `text-[11px] font-medium text-muted-foreground mb-1`
- Read-only text: `text-[13px] text-foreground`
- Input/Dropdown: `text-[13px] h-8`
- Checkboxes: `text-[12.5px]`
- Buttons: `h-8 text-[13px]`
- Divider oben Sekundär-Aktionen: `border-t border-border my-4`

---

## 6. Data Flow & Interactions

### 6.1 Initial Load
```
App.jsx loads currentUser (with tenant_id expanded)
  ↓
MitarbeiterPage → MitarbeiterShell
  ↓
useEffect: pb.collection('users')
  .getFullList({ filter: `tenant_id = "${currentUser.tenantId}"` })
  ↓
State: employees, activeRoleFilter, selectedEmployeeId
```

### 6.2 Rollen-Filtering
```
Click on Sidebar "Admins"
  ↓
setActiveRoleFilter('admin')
  ↓
useMemo: filter employees by role
  ↓
Tabelle re-renders mit gefilterten Mitarbeitern
```

### 6.3 Inline Rolle ändern
```
Click Dropdown in Row → select "Schichtleiter"
  ↓
PUT pb.collection('users').update(employeeId, { role: 'schichtleiter' })
  ↓
Toast.success "Rolle aktualisiert"
  ↓
State updates, Detail-Panel re-renders
```

### 6.4 Lager zuweisen
```
Click "Zuweisen" in Row
  ↓
Modal öffnet mit Checkboxes (Küche, Restaurant, Brauerei)
  ↓
Check/uncheck Lager
  ↓
Click "Speichern" → delete old user_lager records, insert new ones
  ↓
Toast.success "Lager aktualisiert"
  ↓
Detail-Panel re-renders, Tabelle optional zeigt "3 Lager" oder Badge
```

### 6.5 Mitarbeiter einladen
```
Click "+ Mitarbeiter"
  ↓
Dialog öffnet
  ↓
Input: E-Mail, Rolle, optional Lager
  ↓
Click "Einladen" → POST user_invites
  ↓
Toast.success
  ↓
Dialog schließt, Tabelle refreshed
```

### 6.6 Detail-Panel Click
```
Click on Tabellenzeile (außer Inline-Dropdowns)
  ↓
setSelectedEmployeeId(employeeId)
  ↓
Detail-Panel öffnet rechts, zeigt volles Profil
```

---

## 7. Error Handling & Validation

| Scenario | Behavior |
|----------|----------|
| Ungültige E-Mail im Dialog | Validation-Toast: "Ungültige E-Mail" |
| E-Mail existiert bereits | Toast.error: "Mitarbeiter existiert bereits" |
| Netzwerkfehler beim Speichern | Toast.error: "Änderung fehlgeschlagen" + retry möglich |
| User hat keine Permissions (nicht Admin) | Redirect zu Dashboard oder "Zugriff verweigert" |
| Zu wenig Lager zum Zuweisen | Dialog warnt: "Keine Lager verfügbar" |

---

## 8. Accessibility & Keyboard

- All Dropdowns: `<select>` native HTML (keyboard-navigable)
- Dialog: Focus Trap, ESC zum Schließen
- Buttons: `aria-label` für Icon-only Buttons
- Labels: `<label htmlFor="field-id">` associations
- Color: Text-Kontrast nach WCAG AA (via TailwindCSS vars)

---

## 9. Master-Template Konsistenz

✅ **3-Spalten-Layout:** Sidebar (220px) | Content | Detail (384px)
✅ **Headers:** Alle `h-12`, konsistente Padding (px-3 py-2)
✅ **Typography:** text-sm für Headers, text-[12.5px] für Standard, text-[11px] für Labels
✅ **Spacing:** py-1.5 für Rows, gap-2 für Standard
✅ **Colors:** CSS-Variablen (background, foreground, muted-foreground, border, primary, destructive)
✅ **Hover-States:** `hover:bg-muted/50` auf Rows
✅ **Buttons:** h-8, gap-1, text-[12.5px]

---

## 10. Future Enhancements (Out of Scope)

- Bulk-Actions: Multi-Select Checkboxes + Action-Panel (Ansatz 2)
- Advanced Permissions Dialog (Berechtigungen granular bearbeiten)
- Export zu CSV/Excel
- Audit-Log: Wer hat was wann geändert
- Passwort-Policies
- 2FA Management
