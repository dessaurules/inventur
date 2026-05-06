# App-Rollen (PocketBase)

Die React-App wertet das **Auth-Record** (`users`) aus. Bitte in PocketBase ein **Textfeld** anlegen (z. B. `app_role` oder `role`) und pro Nutzer setzen.

## Werte (`app_role` / `role`)

| Wert (Kleinbuchstaben) | Magazin | Inventur | Nutzer-API (`/api/users`) |
|------------------------|---------|----------|---------------------------|
| *(leer)* | nein | ja | nein |
| `admin` oder `is_admin = true` | ja (Schreiben) | ja | ja |
| `lagerleiter` | ja (Schreiben) | ja | nein |
| `inventur` (auch `zaehler`) | nein | ja | nein |
| `magazin_readonly` (auch `readonly`, `magazin_lesen`) | ja (nur Lesen) | ja | nein |

**Hinweis:** `is_admin = true` in PocketBase entspricht immer der Rolle **admin** (volle Rechte in der App).

## API Rules (empfohlen)

Die UI ersetzt **keine** Server-Sicherheit. In PocketBase pro Collection z. B.:

- **Artikel schreiben:** nur wenn `@request.auth.id != ""` und (`@request.auth.is_admin = true` oder `@request.auth.role = "lagerleiter"` oder Feld `app_role` entsprechend).
- **Artikel lesen:** authentifizierte Nutzer mit Magazin- oder Inventur-Rolle.
- **Nur-Lese-Rolle:** `create/update/delete` auf `artikel` verweigern, `list/view` erlauben.

Die genaue Rule-Syntax hängt von euren Feldnamen (`role` vs. `app_role`) ab; bei Bedarf PB **Hooks** nutzen, um `app_role` aus dem JWT zu lesen.

## Express `/api/users`

Nur Nutzer mit **admin**-Rolle (`recordCanManageUsers`: `is_admin` oder `app_role`/`role` = `admin`) dürfen die Routen unter `/api/users` nutzen (siehe `server.mjs`).
