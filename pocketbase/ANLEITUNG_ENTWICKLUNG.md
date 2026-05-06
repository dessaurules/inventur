# Entwicklung: Frontend mit PocketBase verbinden

Diese Anleitung erklärt, wie du die Inventur-App **lokal** startest und sicherstellst, dass **Artikel laden** und **Zähldaten** (`zaehl_sessions`, `zaehlung_aktuell`) in PocketBase ankommen.

---

## Kurz: Warum „funktioniert nicht“?

Die React-App (Vite) spricht mit PocketBase über eine **Basis-URL**. Je nach Einstellung läuft der Weg über **Express (Port 3000)** oder **direkt** auf PocketBase **8090**. Wenn der gewählte Weg nicht passt (Server nicht gestartet, CORS blockiert), siehst du **keine Artikel**, **keine Einträge** in `zaehlung_aktuell` und ggf. Fehler in der **Browser-Konsole** (F12 → Netzwerk / Konsole).

---

## Voraussetzungen

1. **Node.js** installiert (`npm` funktioniert).
2. Im Projektordner: **`npm install`** ausgeführt.
3. **PocketBase** starten – im Projekt typisch:
   ```bash
   cd /pfad/zum/projekt/vibe-inventur
   npm run pb
   ```
   Das entspricht in etwa: Binary mit **`--dir ./pb_data`** und **`--migrationsDir ./pb_migrations`** (siehe `package.json` → Script **`pb`**).
4. Admin prüfen: **http://127.0.0.1:8090/_/** – Collections **`artikel`**, **`zaehl_sessions`**, **`zaehlung_aktuell`** existieren; **API Rules** wie in **`ANLEITUNG_COLLECTIONS.md`** (Abschnitt API Rules).

---

## Zwei empfohlene Setups für `npm run dev`

### Variante A – Direkt zu PocketBase (einfach mit nur Vite)

**Geeignet, wenn du nur Frontend entwickeln willst und PocketBase lokal auf Port **8090** läuft.**

1. Im **Projektroot** eine Datei **`.env`** anlegen oder ergänzen (wie **`env.example`**, aber mit echten Werten):

   ```env
   VITE_POCKETBASE_URL=http://127.0.0.1:8090
   ```

2. **PocketBase CORS** erlauben:
   - PocketBase Admin öffnen → **Settings** (Zahnrad) → Bereich **Application** (Bezeichnung je nach Version).
   - Bei **Allowed origins** / **CORS** die Entwicklungs-URL eintragen, z. B.  
     **`http://localhost:5173`**  
     (ggf. auch **`http://127.0.0.1:5173`**, wenn du die Adresse so im Browser nutzt).
   - Speichern.

3. **Vite neu starten** (wichtig nach `.env`-Änderung):
   ```bash
   npm run dev
   ```
4. App im Browser: **http://localhost:5173**

**Ergebnis:** Anfragen gehen direkt an `http://127.0.0.1:8090/api/...`. **Express auf Port 3000 ist nicht nötig.**

---

### Variante B – Über Express-Proxy (wie Produktion)

**Geeignet, wenn du den gleichen Weg wie `npm start` testen willst: Frontend spricht mit **`/api/pb`**, Express leitet an PocketBase weiter.**

1. **`.env`** im Projektroot (für **Node**, nicht nur Vite):

   ```env
   POCKETBASE_URL=http://127.0.0.1:8090
   POCKETBASE_ADMIN_EMAIL=dein-superuser@email
   POCKETBASE_ADMIN_PASSWORD=dein-passwort
   ```

   **`VITE_POCKETBASE_URL` weglassen** (oder leer lassen), damit das Frontend **`http://localhost:5173/api/pb`** nutzt.

2. **Zwei** Terminal-Fenster:
   - Terminal 1:
     ```bash
     npm run server
     ```
     → Express läuft auf **Port 3000** und proxyt **`/api/pb`** nach **`POCKETBASE_URL`**.
   - Terminal 2:
     ```bash
     npm run dev
     ```
     → Vite leitet **`/api`** an **http://localhost:3000** weiter (siehe `vite.config.js`).

3. App: **http://localhost:5173**

**Ohne laufendes `npm run server`** schlagen Anfragen nach **`/api/pb`** fehl – das ist die häufigste Fehlerquelle bei Variante B.

---

## Produktion („alles von einem Server“)

```bash
npm run build
npm start
```

Express liefert **`dist`** aus und **`/api/pb`** nutzt **`POCKETBASE_URL`** aus `.env`. **`VITE_POCKETBASE_URL`** sollte für dieses Deployment **nicht** auf eine andere Host-URL zeigen, wenn die App unter derselben Domain wie der Proxy laufen soll (sonst baut Vite beim `build` eine feste URL ein).

---

## Checkliste: Zählen und `zaehlung_aktuell`

| Schritt | Erledigt? |
|--------|-----------|
| PocketBase läuft (`npm run pb` o. Ä., **richtiges `--dir ./pb_data`**) | ☐ |
| Entweder **A:** `VITE_POCKETBASE_URL` + **CORS** für `:5173` **oder** **B:** `npm run server` + `npm run dev` | ☐ |
| Nach `.env`-Änderung **Vite neu gestartet** | ☐ |
| In **`artikel`** liegen echte Datensätze (nicht nur `local-…`-Einträge nur im Magazin ohne PB) | ☐ |
| **`zaehlung_aktuell`:** API Rules **List, View, Create, Update** (und **Delete** fürs Aufräumen) | ☐ |

Wenn etwas rotes in der App erscheint: Text lesen – oft **403** → Rules; **Netzwerkfehler** → Variante A/B falsch oder PB nicht gestartet.

---

## Nützliche Dateien im Repo

| Datei | Inhalt |
|--------|--------|
| `env.example` | Variablen-Vorlage inkl. `VITE_POCKETBASE_URL` |
| `pocketbase/ANLEITUNG_COLLECTIONS.md` | Collections, Migrationen, **API Rules** |
| `pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md` | Registrierung, SMTP, Einladungen, Reset, **MFA** |
| `vite.config.js` | Proxy **`/api` → localhost:3000** |
| `src/lib/pocketbase.js` | Wahl der PocketBase-URL (direkt vs. `/api/pb`) |
| `package.json` | Scripts **`dev`**, **`server`**, **`pb`**, **`start`** |

---

## Kurzreferenz Befehle

```bash
# PocketBase (Daten in ./pb_data)
npm run pb

# Nur Frontend, mit VITE_POCKETBASE_URL in .env
npm run dev

# Proxy-Betrieb: beide parallel
npm run server
npm run dev

# Produktion
npm run build && npm start
```
