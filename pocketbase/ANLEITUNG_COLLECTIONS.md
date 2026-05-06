# PocketBase: Drei Collections korrekt anlegen

Diese Anleitung passt zum Projekt **vibe-inventur**. Zum **lokalen Start** (Vite, Express, direkte PB-URL, CORS) siehe **`ANLEITUNG_ENTWICKLUNG.md`** im gleichen Ordner. Es gibt zwei Wege: **Migration (empfohlen)** oder **manuell im Admin-UI**.

---

## Was du vorher brauchst

1. **Laufende PocketBase-Instanz** mit **deiner bestehenden Datenbank** im Projektroot: PocketBase immer mit **`--dir ./pb_data`** starten. Ohne `--dir` verwendet die Binary standardmäßig **`pocketbase-bin/pb_data`** – das ist eine **andere** Datenbank; dort existiert dein **alter Superuser nicht**, Login schlägt fehl. Komfort: im Projektroot **`npm run pb`**.
2. **Collection `artikel`** muss **bereits existieren** (Stammdaten: Artikel für die Inventur).
3. **Ordner `pb_migrations`** liegt im **gleichen Verzeichnis** wie die PocketBase-Binary (oder du startest PB mit `--migrationsDir` auf diesen Ordner im Repo).
4. Optional: **`.env`** fürs Frontend/Express mit `POCKETBASE_*` und ggf. `VITE_*` (siehe `env.example` im Projektroot).

---

## Weg A: Collections per Migration (empfohlen)

### Schritt 1: Projektstruktur prüfen

- Im Repo liegt: `pb_migrations/1775200000_three_inventory_collections.js`
- PocketBase startest du so, dass es **diesen** `pb_migrations`-Ordner findet (meist: Binary und `pb_migrations` im **selben Arbeitsverzeichnis**, z. B. Projektroot).

### Schritt 2: `artikel` anlegen (falls noch nicht)

Im Admin-UI unter **Collections** → neue Base-Collection **`artikel`** mit deinen Feldern (z. B. `name`, `preis`, `artikelnummer`, …). Ohne `artikel` schlägt die Migration fehl.

### Schritt 3: Migration anwenden

- PocketBase starten: z. B. `./pocketbase serve` (Pfad zu deiner Binary anpassen).
- Beim ersten Start wendet PocketBase **alle noch nicht ausgeführten** Dateien in `pb_migrations` automatisch an (**Standard: `--automigrate`**).

**Oder manuell:**

```bash
./pocketbase migrate up
```

(Danach bei laufendem `serve` ggf. **neu starten**, damit der Cache der Collections aktuell ist.)

### Schritt 4: Im Admin prüfen

Unter **Collections** sollten erscheinen:

- `zaehl_sessions`
- `zaehlung_aktuell`
- `inventur_archiv`

---

## Weg B: Manuell im PocketBase Admin-UI

Reihenfolge **unbedingt einhalten** (wegen Relationen).

### Schritt 1: Collection `zaehl_sessions`

1. **New collection** → Typ **Base** → Name exakt: **`zaehl_sessions`**
2. Felder:
   - **`started`** – Typ **Date** (DateTime), **Pflicht**
   - **`ended`** – Typ **Date**, **optional** (nicht Pflicht)
   - **`positionen`** – Typ **JSON**, **optional** – wird beim **Fertig**-Klick mit einem Array befüllt: je Eintrag alle Artikelfelder (Snapshot) plus **`gezaehlte_menge`**

3. **API rules** (nur für lokale Entwicklung oft „alles offen“):  
   List/View/Create/Update/Delete wie bei `artikel` einstellen oder zunächst leere Regeln (`''`) nur in vertrauenswürdiger Umgebung.

4. **Save**

### Schritt 2: Collection `zaehlung_aktuell`

1. **New collection** → Base → Name: **`zaehlung_aktuell`**
2. Felder:
   - **`session`** – **Relation**, eine Auswahl, Collection **`zaehl_sessions`**, **Pflicht**  
     - **Cascade delete** einschalten (wenn die Session gelöscht wird, sollen die Zeilen mit weg)
   - **`artikel`** – **Relation**, eine Auswahl, Collection **`artikel`**, **Pflicht**  
     - **Cascade delete** aus (Stammdaten nicht von Positionszeilen abhängig machen)
   - **`menge`** – **Number**, **Pflicht**, Mindestwert **0**, **Dezimalzahlen erlauben** (nicht „nur ganze Zahlen“, falls du 0,5/0,25 nutzt)

3. **Index (empfohlen):** Eindeutig pro Session + Artikel  
   - Unter **Indexes** (oder SQL-Index je nach PB-Version) einen **UNIQUE**-Index auf **`session`** und **`artikel`** anlegen.  
   - Entspricht der Migration: eine Kombination darf nur einmal vorkommen.

4. **Save**

### Schritt 3: Collection `inventur_archiv`

1. **New collection** → Base → Name: **`inventur_archiv`**
2. Felder:
   - **`inventur_id`** – **Text**, **Pflicht** (z. B. max. 64 Zeichen – gemeinsame ID für alle Zeilen eines abgeschlossenen Laufs)
   - **`abgeschlossen_am`** – **Date**, **Pflicht**
   - **`artikel_ref`** – **Relation**, optional zu **`artikel`**, max. 1 Datensatz, **nicht Pflicht**
   - **`artikelnummer`** – Text, optional, max. ~200 Zeichen
   - **`name`** – Text, **Pflicht**, max. ~500 Zeichen
   - **`preis`** – Number, optional, Dezimal erlaubt
   - **`einheit`** – Text, optional
   - **`groesse`** – Text, optional (entspricht eurem Feld „Größe“ im Frontend)
   - **`category`** – Text, optional
   - **`gezaehlte_menge`** – Number, **Pflicht**, Min **0**, Dezimal erlaubt (Legacy-Kopfzeile; die App speichert die gezählten Zeilen zusätzlich im JSON **`positionen`**)
   - **`positionen`** – **JSON**, **optional** – ein Archiv-Eintrag pro Inventur: Array mit gezählten Artikeln (Stammdaten + Menge). **Max. size** im Admin: PocketBase gibt die Obergrenze in **Bytes** an (Serialisierung des JSON), nicht in Zeichen – z. B. **`2097152`** für ca. **2 MiB**; bei sehr großen Artikellisten ggf. höher setzen.

3. **Index (empfohlen):** normaler Index auf **`inventur_id`** (schnelles Filtern aller Zeilen einer Inventur)

4. **Save**

---

## Frontend / App: Was konfiguriert werden muss

Die Standard-Namen sind:

| Collection        | Standardname       |
|-------------------|--------------------|
| Stammdaten        | `artikel`          |
| Zähl-Sessions     | `zaehl_sessions`   |
| Aktuelle Zählung  | `zaehlung_aktuell`   |
| Archiv            | `inventur_archiv`  |

Abweichende Namen kannst du in der **`.env`** fürs Vite-Frontend setzen (siehe `env.example`):

- `VITE_POCKETBASE_ARTICLES_COLLECTION`
- `VITE_POCKETBASE_ZAEHL_SESSIONS`
- `VITE_POCKETBASE_ZAEHLUNG_AKTUELL`
- `VITE_POCKETBASE_INVENTUR_ARCHIV`

Die zentralen Konstanten stehen in **`src/lib/pocketbaseCollections.js`**.

---

## API Rules richtig einstellen (Schritt für Schritt)

Die Inventur-App spricht **ohne Nutzer-Login** direkt mit PocketBase (über `/api/pb` bzw. eure PB-URL). Damit **Lesen, Schreiben, Realtime und Löschen** funktionieren, müssen die **API rules** der betroffenen Collections passen.

### Wo du die Regeln findest

1. PocketBase-Admin öffnen: **`http://127.0.0.1:8090/_/`** (oder deine Server-URL).
2. Links **Collections** wählen.
3. Die gewünschte Collection anklicken (z. B. **`zaehlung_aktuell`**).
4. Oben rechts das **Zahnrad** (Collection settings) oder den Bereich **API rules** öffnen – je nach PB-Version heißt es **“API Rules”** bzw. liegt unter den Collection-Einstellungen.

Dort gibt es typischerweise (Namen können leicht abweichen):

- **List rule** – Listen abrufen (`getList`, `getFullList`)
- **View rule** – Einzeldatensatz lesen (`getOne`)
- **Create rule** – neue Datensätze anlegen
- **Update rule** – bestehende Datensätze ändern
- **Delete rule** – löschen

### Bedeutung in PocketBase (Kurz)

| Regel-Inhalt | Bedeutung (vereinfacht) |
|--------------|---------------------------|
| **Leer lassen** bzw. **`@request.auth.id != ""`** je nach Version: oft ein **Kontrollkästchen „Öffentlich“** oder ein leeres Eingabefeld | Bei vielen Setups: **jeder** darf (ohne Login) – genau das braucht die App in der **Entwicklung**, wenn ihr kein PocketBase-Auth nutzt. |
| Feld **leer** / Regel entfernt = **kein öffentlicher Zugriff** über die Records-API | Nur noch **Superuser / Admin-API** – dann schlägt die App fehl. |
| Regeln mit **`@request.auth.id`** | Nur **eingeloggte** PocketBase-User – erst sinnvoll, wenn ihr später **Auth** einbaut. |

**Hinweis:** Exakte UI-Texte hängen von der PocketBase-Version ab. Wichtig ist: Für die Inventur ohne Login müssen die Rules so gesetzt sein, dass die **REST-API** für Gäste die gewünschten Aktionen erlaubt (siehe Tabelle unten).

### Empfohlene Einstellung für **Entwicklung / internes Testen** (ohne Auth)

Wenn **niemand** aus dem Internet auf deine PB-Instanz zugreifen soll, kannst du für diese Collections **öffentlichen Lese- und Schreibzugriff** erlauben – so wie es die Migration mit leeren Rules vorsieht.

Pro Collection alle relevanten Rules **so setzen, dass anonyme Clients dürfen** (in der Praxis: Option **„Public“** für List/View/Create/Update/Delete **aktivieren**, oder die Rule-Felder leer lassen, je nachdem was euer PB anbietet).

| Collection | List | View | Create | Update | Delete | Warum |
|------------|------|------|--------|--------|--------|--------|
| **`artikel`** | ja | ja | optional | optional | optional | App lädt Artikel; Magazin ggf. anlegen/bearbeiten. |
| **`zaehl_sessions`** | ja | ja | ja | ja | optional | Start/Ende Session, `positionen` + `ended` schreiben, offene Sessions finden. |
| **`zaehlung_aktuell`** | ja | ja | ja | ja | ja | **Live-Zählen** (Create/Update), Sync/Polling, **Realtime**; **Delete** beim „Fertig“-Aufräumen. |
| **`inventur_archiv`** | optional | optional | optional | optional | optional | Nur nötig, wenn die App dort schreibt/liest. |

**Realtime:** Wenn **Subscribe** auf `zaehlung_aktuell` still fehlschlägt, sind oft **List/View** zu restriktiv – beides für Gäste erlauben.

**Nach Änderungen:** Seite neu laden; bei manchen PB-Versionen PocketBase kurz **neu starten**.

### Checkliste, wenn „es speichert nicht“

1. **`zaehlung_aktuell`:** Create **und** Update **und** List erlaubt?  
2. **`zaehl_sessions`:** Create (neue Session), Update (`ended`, `positionen`)?  
3. Browser **Netzwerk-Tab**: Fehler **403** → fast immer **API rule**.  
4. Feld **`positionen`** (JSON) existiert in **`zaehl_sessions`**? (Migration `1775300000_zaehl_sessions_positionen.js` oder manuell angelegt.)

### Produktion / Internet

- **Nicht** dauerhaft alles öffentlich schreibbar lassen.  
- Varianten: **PocketBase Auth** + Regeln mit `@request.auth.id`, oder **nur euer Node-Server** mit Admin-Token spricht mit PB (Frontend ruft nicht direkt PB auf).  
- Dann die Rules restriktiv und nur die nötigen Endpunkte im Backend freigeben.

---

## Sicherheit (kurz)

- Mit **öffentlichen / leeren Regeln** ist die Datenbank für jeden erreichbar, der die URL kennt – nur für **vertrauenswürdige** Umgebungen.  
- Für Produktion: **Regeln verschärfen** oder Schreibzugriff nur über **Express + Admin-Token** (wie bei eurem `server.mjs`).

---

## Häufige Probleme

| Problem | Lösung |
|--------|--------|
| `zsh: permission denied: ./pocketbase` | Im Projektroot ist **`pocketbase` ein Ordner** (Dokumentation), keine Binary. Start: **`./pocketbase-bin/pocketbase serve`**. Optional Quarantäne: `xattr -d com.apple.quarantine pocketbase-bin/pocketbase` |
| Migration meldet Fehler zu `artikel` | Zuerst Collection **`artikel`** anlegen. |
| Migration findet `pb_migrations` nicht | Binary im richtigen Verzeichnis starten oder `--migrationsDir` setzen. |
| Unique-Index auf `zaehlung_aktuell` schlägt fehl | Index im Dashboard prüfen; Spaltennamen müssen zu den Feldern **`session`** und **`artikel`** passen. |
| Collections doppelt | Entweder nur Migration **oder** nur manuell anlegen – nicht beides mit gleichen Namen. |
| API **403** beim Zählen / Speichern | **API rules** der Collection prüfen (siehe Abschnitt **„API Rules richtig einstellen“**). |
| **`npm run dev`**, aber **keine** Daten / Netzwerkfehler | Standard: Aufrufe gehen auf **`/api/pb`** → Vite leitet an **Port 3000** weiter. **Entweder** parallel **`npm run server`** starten (`.env` mit `POCKETBASE_URL`) **oder** in der Frontend-`.env`: **`VITE_POCKETBASE_URL=http://127.0.0.1:8090`** und in PocketBase **CORS** die Origin **`http://localhost:5173`** erlauben. |
| In **`zaehlung_aktuell`** erscheinen **keine Zeilen** im Admin | 1) **Zählen** starten und bei einem Artikel **aus PocketBase** (+1 o. Ä.) tippen (kein reines `local-…`-Artikel). 2) **API Rules** für Create/List prüfen – die App zeigt sonst eine **rote Fehlermeldung**. 3) Exakter Collection-Name: **`zaehlung_aktuell`** (ohne Umlaut). 4) Dieselbe **`pb_data`**, mit der die App spricht. |

---

## Bezug im Code

- Migrationen: `pb_migrations/1775200000_three_inventory_collections.js`, `pb_migrations/1775300000_zaehl_sessions_positionen.js` (Feld **`positionen`**)
- Collection-Namen: `src/lib/pocketbaseCollections.js`
- Beispiel-Env: `env.example`
