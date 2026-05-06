# Auth: Registrierung sperren, E-Mail, Einladungen, Passwort-Reset, MFA

Diese Anleitung ergänzt **`ANLEITUNG_ENTWICKLUNG.md`** und **`ANLEITUNG_COLLECTIONS.md`**. Sie beschreibt die Konfiguration in **PocketBase** und die **App-Funktionen** (Login, Einladungen, MFA).

---

## 1. Öffentliche Registrierung abschalten

1. PocketBase Admin öffnen → **Collections** → Auth-Collection **`users`** → Zahnrad **Edit collection**.
2. Unter **Options** / **Auth** (Bezeichnung je nach Version):
   - **Allow only verified users to sign-in** optional aktivieren (nur wenn E-Mail-Verifikation genutzt wird).
   - **Allow new users to sign-up** bzw. öffentliche Registrierung **deaktivieren**, wenn Nutzer nur per **Admin** oder **Einladung** entstehen sollen.

Nutzer anlegen dann über: PocketBase Admin, **Einladungs-Flow** (`user_invites` + `POST /api/invite/accept`) oder eure eigenen Prozesse.

---

## 2. SMTP / E-Mail (Verifikation, Reset, OTP, MFA)

Ohne funktionierenden **Mailer** sendet PocketBase keine Mails (Bestätigung, Passwort-Reset, OTP).

**Zwei Mail-Kanäle:**

1. **PocketBase-Admin** → **Settings** → **Mail**: Verifikation, Passwort-Reset, OTP (MFA).
2. **Projekt-`.env` + Express** (`server.mjs`, **nodemailer**): **Einladungen per E-Mail** (`POST /api/invite/send`) mit `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, optional `APP_PUBLIC_URL` / `APP_NAME`.

1. **Settings** → **Mail settings** (oder **SMTP**).
2. Host, Port, Benutzer, Passwort, TLS wie beim Provider eintragen.
3. **Sender address** / **From** setzen.
4. **Application URL** (`APP_URL`) korrekt setzen – sie wird in E-Mail-Templates verwendet (Links zur App).

**Test:** In der Auth-Collection **Test email** / **Send test** nutzen, falls vorhanden.

### E-Mail kommt nicht an – Checkliste

1. **Terminal von PocketBase** (`npm run pb`): Steht dort ein Fehler zu SMTP/TLS beim Versand?
2. **Settings → Mail** in PocketBase: Host, Port, TLS/SSL, Benutzer, Passwort, Absender vollständig? (Bei Gmail/Outlook oft **App-Passwort** nötig.)
3. **Spam** und **Promotions**-Ordner prüfen.
4. **Passwort-Reset / Verifikation:** In der Collection **users** die Optionen **Password reset** bzw. **Confirm email** wirklich aktiv?
5. **Einladung per App:** Dafür muss **`SMTP_HOST`** in der `.env` des Node-Servers stehen und **`npm run server`** laufen (siehe Log beim Start).

### E-Mail-Verifikation

- In den **users**-Optionen **Confirm email** / E-Mail-Bestätigung aktivieren.
- Die App lehnt nach erfolgreichem Passwort-Login ab, wenn **`verified`** noch `false` ist, und zeigt einen Hinweis. Button **Bestätigungsmail erneut senden** ruft `requestVerification(email)` auf.

### Passwort zurücksetzen

1. In **users** die Option **Password reset** aktivieren.
2. Im Template für die Reset-Mail die **URL zur App** so setzen, dass der Token ankommt, z. B.:

   `{APP_URL}/?pb_reset_token={TOKEN}`

   (Platzhalter je nach PocketBase-Version: oft `{TOKEN}`; siehe Vorschau im Admin.)

3. Die App liest `pb_reset_token`, alternativ `token` oder `resetToken`, und zeigt das Formular **Neues Passwort setzen** (`confirmPasswordReset`).

---

## 3. Collection `user_invites` (Migration)

Die Migration **`pb_migrations/1775500000_user_invites.js`** legt die Collection **`user_invites`** mit Regeln an: **nur Admins** (`is_admin` oder `role = admin`) dürfen Datensätze sehen und anlegen.

Felder u. a.:

| Feld | Bedeutung |
|------|-----------|
| `email` | E-Mail des künftigen Nutzers |
| `token` | Geheimer Einladungs-Token (einmalig) |
| `expires_at` | Ablaufzeit |
| `consumed_at` | gesetzt, wenn der Token verwendet wurde |
| `target_is_admin` / `target_role` | Rolle nach Anlage (`admin`, `lagerleiter`, `inventur`, `magazin_readonly`) |

**Admin-UI:** Menü **Mitarbeiter** → Tab **Einladungen** (Versand per E-Mail) bzw. **Verwalten** (Rollen ändern, `PATCH /api/users/:id` mit `role`).

### Einladung per E-Mail senden

- **`POST /api/invite/send`** (mit `Authorization: Bearer <PocketBase-User-Token>`, Admin): legt `user_invites` an und sendet die Mail über **nodemailer**.
- Body: `email`, `targetRole`, `validDays`, optional `appBaseUrl` (Basis-URL für den Link, Standard `window.location.origin` bzw. `APP_PUBLIC_URL`).

### Einladung annehmen (Server)

Das Frontend ruft **`POST /api/invite/accept`** auf (relativ `/api/invite/accept`):

- Body: `{ "token", "password", "passwordConfirm" }`
- Der **Express-Server** (`npm run server` / `npm start`) benötigt **`POCKETBASE_URL`** und einen gültigen **Superuser** (`POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD`), wie für `/api/users`.

**Entwicklung:** Vite proxyt `/api` → Port 3000; PocketBase und **`npm run server`** parallel starten.

**Nur `VITE_POCKETBASE_URL` ohne Node-Server:** Einladungen annehmen ist **nicht** möglich, bis ein Server den Endpunkt bereitstellt (oder ihr einen alternativen Weg nutzt).

Optional: **`POCKETBASE_INVITES_COLLECTION`** in `.env`, falls der Collection-Name abweicht (Standard: `user_invites`).

---

## 4. Multi-Faktor-Authentifizierung (MFA) in PocketBase

Voraussetzung: **PocketBase v0.23+**.

1. **Collections** → **`users`** → **Options** → **Auth**.
2. **Multi-factor authentication (MFA)** aktivieren (optional **Duration** anpassen).
3. Mindestens **zwei** aktive Methoden konfigurieren, z. B.:
   - **Email/Password** (Identity + Passwort)
   - **One-time password (OTP)** (Code per E-Mail)

Ablauf in der App:

1. Nutzer gibt E-Mail + Passwort ein → PocketBase antwortet mit **401** und **`mfaId`** im JSON-Body.
2. Die App fordert per **`requestOTP(email)`** einen Code an (oder der Nutzer nutzt **Code erneut senden**).
3. **`authWithOTP(otpId, code, { mfaId })`** schließt die Anmeldung ab.

Siehe auch: [PocketBase Docs – Multi-factor authentication](https://pocketbase.io/docs/authentication/#multi-factor-authentication-mfa).

**Hinweis:** MFA ist eine **Server-/Dashboard-Konfiguration**. Die App unterstützt den dokumentierten Ablauf **Passwort + E-Mail-OTP**. Andere Kombinationen (z. B. OAuth2 als zweiter Faktor) sind in PocketBase möglich, ggf. Login-UI erweitern.

---

## 5. Kurz-Checkliste

| Thema | Erledigt? |
|--------|-----------|
| Registrierung in PB deaktiviert (falls gewünscht) | ☐ |
| SMTP getestet | ☐ |
| `APP_URL` / Reset-Link mit `pb_reset_token` | ☐ |
| Migration `user_invites` angewendet (`npm run pb` / migrate) | ☐ |
| `npm run server` + `.env` für Einladungen und Produktion | ☐ |
| MFA + OTP in **users** aktiviert (optional) | ☐ |

---

## Bezug im Code

| Bereich | Datei |
|--------|--------|
| Login, Reset, MFA, Einladungs-Tab | `src/components/LoginView.jsx` |
| Mitarbeiter (Einladungen / Verwalten) | `MitarbeiterView.jsx`, `UserInvitesAdminSection.jsx`, `MitarbeiterVerwaltenSection.jsx` |
| Einladungs-E-Mail + Rollen-API | `server.mjs` (`/api/invite/send`, `PATCH /api/users/:id`) |
| Invite-API | `server.mjs` → `POST /api/invite/accept` |
| Collection-Namen | `src/lib/pocketbaseCollections.js` |
| Migration | `pb_migrations/1775500000_user_invites.js` |
