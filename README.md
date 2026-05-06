# Vibe Inventur

Digitale Inventur-App für die Gastronomie. Artikel pflegen, Bestände zählen, Rechnungs-PDFs importieren und Preisentwicklungen verfolgen.

**Stack:** React + Vite · Express (PDF-API, Proxy, Einladungen) · PocketBase (SQLite-Datenbank + Auth)

---

## Schnellstart

```bash
npm install
cp env.example .env   # .env befüllen (s. unten)
npm run dev:full      # PocketBase + Vite + Express parallel starten
```

App: **http://localhost:5173** · PocketBase-Admin: **http://127.0.0.1:8090/_/**

---

## Voraussetzungen

- **Node.js** ≥ 18
- **PocketBase-Binary** unter `./pocketbase-bin/pocketbase`  
  → einmalig herunterladen von [pocketbase.io/docs](https://pocketbase.io/docs/)  
  → ggf. macOS-Quarantäne entfernen: `xattr -d com.apple.quarantine pocketbase-bin/pocketbase`

---

## Umgebungsvariablen

`.env`-Datei im Projektordner anlegen (Vorlage: `env.example`). Pflichtfelder:

```env
# Express-Port (Standard: 3000)
VITE_EXPRESS_PORT=3000

# PocketBase-URL (Backend + Frontend direkt)
POCKETBASE_URL=http://127.0.0.1:8090
VITE_POCKETBASE_URL=http://127.0.0.1:8090

# PocketBase Superuser (aus http://127.0.0.1:8090/_/)
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=dein-passwort
```

Alle weiteren optionalen Variablen (SMTP, Mandanten-Bootstrap, App-Name, Collection-Namen …) sind in **`env.example`** dokumentiert.

---

## Entwicklung starten

### Alles auf einmal (empfohlen)

```bash
npm run dev:full
```

Startet parallel: **PocketBase** (Port 8090) · **Vite** (Port 5173) · **Express** (Port 3000)

> PocketBase wendet beim Start alle noch ausstehenden Migrationen aus `pb_migrations/` automatisch an.

### Oder einzeln

| Befehl | Startet |
|---|---|
| `npm run pb` | Nur PocketBase |
| `npm run dev` | Nur Vite Dev-Server |
| `npm run server` | Nur Express API |
| `npm run dev:stack` | PocketBase + Vite (ohne Express) |

> **Variante A (einfach):** `VITE_POCKETBASE_URL` in `.env` + PocketBase CORS für `http://localhost:5173` freischalten → `npm run dev:stack` reicht.  
> **Variante B (wie Produktion):** `VITE_POCKETBASE_URL` weglassen → `npm run dev:full` oder `npm run server` + `npm run dev` parallel.  
> Details: **`pocketbase/ANLEITUNG_ENTWICKLUNG.md`**

---

## Erster Start: PocketBase einrichten

1. `npm run pb` starten
2. [http://127.0.0.1:8090/_/](http://127.0.0.1:8090/_/) öffnen — **Superuser** anlegen (E-Mail + Passwort)
3. Zugangsdaten in `.env` unter `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` eintragen
4. PocketBase neu starten (`Ctrl+C` + `npm run pb`) — Migrationen werden automatisch angewendet
5. Unter **Settings → Application** die Origin `http://localhost:5173` als erlaubte CORS-Origin eintragen (nur bei Variante A nötig)

---

## Features

### Magazin / Artikelverwaltung

- Artikel anlegen, bearbeiten, archivieren
- Felder: Name, Preis, Einheit, Kategorie, Stück/Liefergebinde, Lieferanten-Artikelnummer
- Barcode-Scanner (ZXing) für schnelle Artikel-Suche
- Kategorie-Seitenleiste, Suchpalette, Drag & Drop Sortierung
- Artikel-Export (XLSX, PDF via jsPDF)

### PDF-Rechnungsimport (SAGA-Format)

> Benötigt laufenden Express-Server (`npm run server` oder `npm run dev:full`)

1. Im Magazin auf **„Rechnung importieren"** klicken
2. SAGA-Rechnung als PDF hochladen
3. Der Express-Server parst die Positionen (`lib/sagaInvoiceParse.mjs`)
4. Erkannte Artikel werden mit dem aktuellen DB-Preis verglichen
5. Preisänderungen können einzeln oder alle zusammen übernommen werden

Stück/Liefergebinde wird automatisch aus „NxM"-Mustern im Produktnamen erkannt (z. B. `6x1,0L`). Der in der Datenbank hinterlegte Wert hat Vorrang, falls er bereits gesetzt ist.

### Preisverlauf

- Jede Preisänderung wird per PocketBase-Hook in `artikel_preis_historie` geloggt
- Verlauf als interaktiver **Area-Chart** (Recharts) im Artikel-Detail sichtbar
- Zeitraum-Filter: 30 Tage · 90 Tage · 1 Jahr · Alle
- Trend-Anzeige (Änderung seit erstem erfasstem Preis)
- Liste der letzten 5 Preisänderungen mit Delta

### Inventur / Zählsessions

- Zählsessions starten und beenden
- Artikel per Barcode-Scanner oder Tippen zählen
- Mehrere Lager und Unterlager
- Realtime-Sync zwischen Geräten (PocketBase Subscriptions)
- Abgeschlossene Inventuren archivieren

### Nutzerverwaltung & Auth

- Login, Registrierung (abschaltbar), Passwort-Reset über PocketBase
- Rollen: Admin, Manager, Mitarbeiter
- Einladungs-Flow per E-Mail (`user_invites` Collection)
- MFA-Unterstützung (OTP via PocketBase)
- E-Mail-Verifikation
- Details: **`pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md`**

---

## Datenbankmigrationen

Migrationen liegen in `./pb_migrations/` und werden beim PocketBase-Start **automatisch** angewendet. Kein manueller Schritt nötig.

Wichtige Migrationen:

| Datei | Inhalt |
|---|---|
| `1775139894_created_artikel.js` | Artikel-Stammdaten |
| `1775200000_three_inventory_collections.js` | `zaehl_sessions`, `zaehlung_aktuell`, `inventur_archiv` |
| `1775315428_created_user_invites.js` | Einladungs-Collection |
| `1775500000_users_roles_tenant_rules.js` | Rollen & Mandanten |
| `1775600000_lager_hierarchie.js` | Lager- und Unterlager-Hierarchie |
| `1777900000_created_artikel_preis_historie.js` | Preisverlauf-Collection |
| `1778000000_artikel_lieferant_gebinde.js` | Felder `stueck_pro_liefergebinde` + `lieferanten_artnr` |

Collections und API Rules: **`pocketbase/ANLEITUNG_COLLECTIONS.md`**

---

## Produktion

```bash
npm run build
npm start        # Build + Express-Server (liefert dist/ aus)
```

Express liefert den Vite-Build (`dist/`) aus und proxyt `/api/pb` auf `POCKETBASE_URL`. `VITE_POCKETBASE_URL` sollte für Produktions-Builds **nicht** gesetzt sein, damit der Express-Proxy verwendet wird.

---

## Nützliche Skripte

| Skript | Beschreibung |
|---|---|
| `npm run dev:full` | PocketBase + Vite + Express parallel starten |
| `npm run dev:stack` | PocketBase + Vite (ohne Express) |
| `npm run dev` | Nur Vite Dev-Server |
| `npm run pb` | Nur PocketBase |
| `npm run server` | Nur Express API |
| `npm run build` | Produktions-Build |
| `npm start` | Build + Express (Produktion) |
| `npm run bootstrap:tenant` | Mandant, Standort, Lager einmalig initialisieren |
| `npm run report:preis-historie` | Preisverlauf-Report ausgeben |
| `npm run backfill:preis-historie-drift` | Preisverlauf-Drift nachfüllen |
| `npm run lint` | ESLint |

---

## Projektstruktur

```
src/
  backend/
    magazin/                  # Artikelverwaltung, PDF-Import, Preisverlauf
      magazin-shell.jsx       # Hauptkomponente Magazin
      invoice-import-dialog.jsx
      artikel-preis-historie.jsx
      detail-drawer-form.jsx  # Artikel-Formular (Enter-to-save)
  components/
    Preisverlauf.jsx          # Area-Chart (Recharts)
  lib/
    pocketbase.js             # PocketBase-Client (direkt vs. Proxy)
    pocketbaseCollections.js  # Collection-Namen (konfigurierbar per .env)

lib/
  sagaInvoiceParse.mjs        # PDF-Parsing für SAGA-Rechnungen

server.mjs                    # Express: /api/health, /api/magazin/parse-invoice-pdf,
                              #          /api/pb (Proxy), /api/invite, /api/users …
pb_migrations/                # PocketBase-Migrationen (werden auto-angewendet)
pb_data/                      # PocketBase-Datenbankdaten (nicht ins Git!)
pocketbase/                   # Entwicklungs- und Konfigurations-Anleitungen
scripts/                      # Einmalige Hilfsskripte (Bootstrap, Reports)
env.example                   # Vorlage für .env
```

---

## Weiterführende Dokumentation

| Datei | Inhalt |
|---|---|
| `pocketbase/ANLEITUNG_ENTWICKLUNG.md` | Variante A/B, CORS, Proxy, Produktionssetup |
| `pocketbase/ANLEITUNG_COLLECTIONS.md` | Collections, Migrationen, API Rules |
| `pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md` | Auth, SMTP, Einladungen, MFA |
| `env.example` | Alle Umgebungsvariablen kommentiert |

---

## Häufige Probleme

| Problem | Lösung |
|---|---|
| Keine Daten / Netzwerkfehler im Browser | `npm run dev:full` statt nur `npm run dev`. Oder `VITE_POCKETBASE_URL` in `.env` + CORS in PocketBase freischalten. |
| `zsh: permission denied: ./pocketbase` | Das ist ein **Ordner** (Doku), keine Binary. Start: `npm run pb` (nutzt `./pocketbase-bin/pocketbase`). |
| `Auf Port 3000 läuft kein aktueller Express` | `npm run server` neu starten. Oder `npm run dev:full` verwenden. |
| Migrationen nicht angewendet (Felder fehlen) | PocketBase neu starten — es wendet automatisch ausstehende Migrationen an. |
| API 403 beim Speichern | API Rules der Collection in PocketBase prüfen (List/View/Create/Update/Delete für Nutzer freischalten). Details: `pocketbase/ANLEITUNG_COLLECTIONS.md`. |
| PDF-Import: „Keine Positionszeilen erkannt" | Nur SAGA-Rechnungen werden unterstützt. Rohtext erscheint in der Browser-Konsole (F12 → Console). |
| macOS Quarantäne-Warnung bei PocketBase | `xattr -d com.apple.quarantine pocketbase-bin/pocketbase` |
