import { useCallback, useEffect, useState } from 'react'
import { pb } from '../lib/pocketbase'

function authHeaders() {
  const token = pb.authStore.token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function apiGetMailSettings() {
  const r = await fetch('/api/mail-settings', { headers: authHeaders() })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

async function apiPutMailSettings(body) {
  const r = await fetch('/api/mail-settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

async function apiPostTestMail(to) {
  const r = await fetch('/api/mail-settings/test', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ to }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

/**
 * SMTP für Einladungs-Mails (nodemailer / server.mjs). Nur Admins (manageUsers).
 */
export default function MailSmtpSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })

  const [envOverrides, setEnvOverrides] = useState(false)
  const [activeSource, setActiveSource] = useState('none')

  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [encryption, setEncryption] = useState('starttls')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [mailFrom, setMailFrom] = useState('')
  const [appName, setAppName] = useState('')
  const [authMethodLogin, setAuthMethodLogin] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  const [testTo, setTestTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback({ type: '', text: '' })
    try {
      const d = await apiGetMailSettings()
      setEnvOverrides(Boolean(d.envOverrides))
      setActiveSource(d.activeSource || 'none')
      setHost(d.host || '')
      setPort(Number(d.port) || 587)
      setEncryption(['ssl', 'starttls', 'none'].includes(d.encryption) ? d.encryption : 'starttls')
      setUser(d.user || '')
      setPassword('')
      setMailFrom(d.mailFrom || '')
      setAppName(d.appName || '')
      setAuthMethodLogin(Boolean(d.authMethodLogin))
      setHasPassword(Boolean(d.hasPassword))
    } catch (e) {
      setFeedback({ type: 'error', text: e?.message || 'Einstellungen konnten nicht geladen werden.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback({ type: '', text: '' })
    try {
      const body = {
        host: host.trim(),
        port,
        encryption,
        user: user.trim(),
        mailFrom: mailFrom.trim(),
        appName: appName.trim(),
        authMethodLogin,
      }
      if (password.length > 0) {
        body.password = password
      }
      const d = await apiPutMailSettings(body)
      setEnvOverrides(Boolean(d.envOverrides))
      setActiveSource(d.activeSource || 'none')
      setHasPassword(Boolean(d.hasPassword))
      setPassword('')
      setFeedback({ type: 'success', text: 'SMTP-Einstellungen gespeichert.' })
    } catch (e) {
      setFeedback({ type: 'error', text: e?.message || 'Speichern fehlgeschlagen.' })
    } finally {
      setSaving(false)
    }
  }

  const clearStored = async () => {
    if (!window.confirm('Gespeicherte SMTP-Daten auf dem Server löschen?')) return
    setSaving(true)
    setFeedback({ type: '', text: '' })
    try {
      const d = await apiPutMailSettings({ host: '' })
      setEnvOverrides(Boolean(d.envOverrides))
      setActiveSource(d.activeSource || 'none')
      setHost('')
      setPort(587)
      setEncryption('starttls')
      setUser('')
      setPassword('')
      setMailFrom('')
      setAppName('')
      setAuthMethodLogin(false)
      setHasPassword(false)
      setFeedback({ type: 'success', text: 'Gespeicherte SMTP-Daten entfernt.' })
    } catch (e) {
      setFeedback({ type: 'error', text: e?.message || 'Löschen fehlgeschlagen.' })
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    const to = testTo.trim().toLowerCase()
    if (!to) {
      setFeedback({ type: 'error', text: 'Bitte Empfänger-E-Mail für den Test eingeben.' })
      return
    }
    setTesting(true)
    setFeedback({ type: '', text: '' })
    try {
      await apiPostTestMail(to)
      setFeedback({ type: 'success', text: 'Testmail wurde versendet.' })
    } catch (e) {
      setFeedback({ type: 'error', text: e?.message || 'Testmail fehlgeschlagen.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="admin-view">
      <header className="admin-magazin-header">
        <h2 className="admin-magazin-title">E-Mail (SMTP)</h2>
        <p className="admin-card-hint admin-mitarbeiter-lead">
          Konfiguration für <strong>Einladungs-E-Mails</strong> (Express + nodemailer). PocketBase-Dashboard-Mail
          (Verifikation usw.) ist getrennt. Zuverlässiger Versand braucht oft korrektes{' '}
          <strong>SPF/DKIM</strong> beim Provider.
        </p>
      </header>

      {envOverrides ? (
        <section className="admin-card" aria-label="Hinweis Umgebungsvariablen">
          <p className="admin-feedback admin-feedback--error" role="status">
            In der <code className="auth-code">.env</code> ist <code className="auth-code">SMTP_HOST</code> gesetzt –
            diese Werte haben <strong>Vorrang</strong>. Die unten gespeicherten Daten werden für den Versand nicht
            genutzt, bis <code className="auth-code">SMTP_HOST</code> in der .env entfernt ist.
          </p>
        </section>
      ) : null}

      {!envOverrides && activeSource === 'file' ? (
        <p className="admin-card-hint admin-card-hint--stack">
          Aktiver Versand: <strong>gespeicherte Einstellungen</strong> (<code className="auth-code">data/mail-settings.json</code>).
        </p>
      ) : null}

      {!envOverrides && activeSource === 'none' ? (
        <p className="admin-card-hint admin-card-hint--stack">
          Keine gespeicherten SMTP-Daten. Ohne <code className="auth-code">SMTP_HOST</code> in der .env kann ggf.{' '}
          <strong>PocketBase Mail + SMTP_PASS</strong> greifen (siehe Doku).
        </p>
      ) : null}

      {feedback.text ? (
        <p
          className={`${
            feedback.type === 'error' ? 'admin-feedback admin-feedback--error' : 'admin-feedback admin-feedback--ok'
          } admin-card-hint--stack`}
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}

      <section className="admin-card" aria-labelledby="smtp-form-title">
        <h3 id="smtp-form-title" className="admin-card-title">
          SMTP-Server
        </h3>
        {loading ? (
          <p className="admin-empty">Laden …</p>
        ) : (
          <form className="admin-artikel-form" onSubmit={submit}>
            <div className="admin-form-grid">
              <div className="admin-field admin-field--full">
                <label htmlFor="smtp-host">SMTP-Host</label>
                <input
                  id="smtp-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="z. B. smtp.example.com"
                  autoComplete="off"
                />
              </div>
              <div className="admin-field">
                <label htmlFor="smtp-port">Port</label>
                <input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 587)}
                />
              </div>
              <div className="admin-field">
                <label htmlFor="smtp-enc">Verschlüsselung</label>
                <select
                  id="smtp-enc"
                  value={encryption}
                  onChange={(e) => setEncryption(e.target.value)}
                >
                  <option value="starttls">STARTTLS (typisch Port 587)</option>
                  <option value="ssl">SSL/TLS (typisch Port 465)</option>
                  <option value="none">Keine (nur lokal / Sonderfälle)</option>
                </select>
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="smtp-user">Benutzername (optional)</label>
                <input
                  id="smtp-user"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="smtp-pass">Passwort / App-Passwort</label>
                <input
                  id="smtp-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasPassword ? '(unverändert lassen oder neu setzen)' : ''}
                  autoComplete="new-password"
                />
                {hasPassword && !password ? (
                  <span className="admin-mitarbeiter-self-hint"> Gespeichert – leer lassen zum Beibehalten.</span>
                ) : null}
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="smtp-from">Absender (From)</label>
                <input
                  id="smtp-from"
                  value={mailFrom}
                  onChange={(e) => setMailFrom(e.target.value)}
                  placeholder="Name &lt;mail@domain.de&gt; oder mail@domain.de"
                  autoComplete="off"
                />
              </div>
              <div className="admin-field admin-field--full">
                <label htmlFor="smtp-appname">App-Name (Betreff „Einladung: …“)</label>
                <input
                  id="smtp-appname"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="leer = aus .env APP_NAME oder „Inventur“"
                  autoComplete="off"
                />
              </div>
              <div className="admin-field admin-field--full">
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={authMethodLogin}
                    onChange={(e) => setAuthMethodLogin(e.target.checked)}
                  />{' '}
                  SMTP AUTH <strong>LOGIN</strong> (z. B. Microsoft 365)
                </label>
              </div>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary" disabled={saving || envOverrides}>
                {saving ? 'Speichern …' : 'Speichern'}
              </button>
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={saving || envOverrides}
                onClick={() => void load()}
              >
                Zurücksetzen (laden)
              </button>
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={saving || envOverrides}
                onClick={() => void clearStored()}
              >
                Gespeicherte Daten löschen
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="admin-card" aria-labelledby="smtp-test-title">
        <h3 id="smtp-test-title" className="admin-card-title">
          Testmail
        </h3>
        <p className="admin-card-hint">
          Verwendet dieselbe Priorität wie der Einladungsversand (.env → gespeicherte Daten → PocketBase).
        </p>
        <div className="admin-form-grid">
          <div className="admin-field admin-field--full">
            <label htmlFor="smtp-test-to">Empfänger</label>
            <input
              id="smtp-test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="test@example.com"
            />
          </div>
        </div>
        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-btn-primary"
            disabled={testing || loading}
            onClick={() => void sendTest()}
          >
            {testing ? 'Senden …' : 'Testmail senden'}
          </button>
        </div>
      </section>
    </div>
  )
}
