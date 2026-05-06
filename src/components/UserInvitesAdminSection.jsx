import { useCallback, useEffect, useState } from 'react'
import { pb } from '../lib/pocketbase'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { APP_ROLES } from '../lib/userCapabilities'

const INV = PB_COLLECTIONS.userInvites

function inviteLinkForToken(token) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('invite', token)
    return url.toString()
  } catch {
    return `?invite=${encodeURIComponent(token)}`
  }
}

function appBaseUrlForInvite() {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

async function postInviteSendEmail(body) {
  const token = pb.authStore.token
  const r = await fetch('/api/invite/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = data.error || `HTTP ${r.status}`
    throw new Error(typeof msg === 'string' ? msg : 'Anfrage fehlgeschlagen.')
  }
  return data
}

const ROLE_OPTIONS = [
  { value: APP_ROLES.inventur, label: 'Inventur' },
  { value: APP_ROLES.lagerleiter, label: 'Lagerleiter' },
  { value: APP_ROLES.magazin_readonly, label: 'Magazin (nur lesen)' },
  { value: APP_ROLES.admin, label: 'Administrator' },
]

/**
 * Einladungen per E-Mail senden (Server: SMTP + user_invites), Liste & Link kopieren.
 */
export default function UserInvitesAdminSection({ canManageInvites }) {
  const [email, setEmail] = useState('')
  const [targetRole, setTargetRole] = useState(APP_ROLES.inventur)
  const [validDays, setValidDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [rows, setRows] = useState([])

  const loadList = useCallback(async () => {
    setListBusy(true)
    try {
      const list = await pb.collection(INV).getFullList({ sort: '-created', requestKey: null })
      setRows(list)
    } catch (e) {
      setFeedback({
        type: 'error',
        text: pocketBaseFullErrorMessage(e) || 'Einladungen konnten nicht geladen werden.',
      })
      setRows([])
    } finally {
      setListBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!canManageInvites) return
    void loadList()
  }, [canManageInvites, loadList])

  const submitCreate = async (event) => {
    event.preventDefault()
    if (!canManageInvites) return
    const mail = email.trim().toLowerCase()
    if (!mail) {
      setFeedback({ type: 'error', text: 'E-Mail ist Pflicht.' })
      return
    }
    const days = Math.min(90, Math.max(1, Number(validDays) || 7))
    const isAdminRole = targetRole === APP_ROLES.admin
    const roleToSend = isAdminRole ? APP_ROLES.admin : targetRole
    setBusy(true)
    setFeedback({ type: '', text: '' })
    try {
      const data = await postInviteSendEmail({
        email: mail,
        targetRole: roleToSend,
        validDays: days,
        appBaseUrl: appBaseUrlForInvite(),
      })
      setEmail('')
      await loadList()
      if (data.mailSent === false) {
        setFeedback({
          type: 'success',
          text: `Einladung angelegt (ohne SMTP). Der Link ist ${days} Tag(e) gültig. Teile ihn manuell – z. B. „Link kopieren“ in der Liste unten.`,
        })
      } else {
        setFeedback({
          type: 'success',
          text: `Einladung per E-Mail gesendet. Der Link ist ${days} Tag(e) gültig (nur die Einladung; das Konto danach unbegrenzt nutzbar).`,
        })
      }
    } catch (e) {
      setFeedback({
        type: 'error',
        text: e?.message || 'Versand fehlgeschlagen.',
      })
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async (token) => {
    const link = inviteLinkForToken(token)
    try {
      await navigator.clipboard.writeText(link)
      setFeedback({ type: 'success', text: 'Link kopiert.' })
    } catch {
      setFeedback({ type: 'error', text: 'Zwischenablage nicht verfügbar.' })
    }
  }

  if (!canManageInvites) return null

  return (
    <section className="admin-panel" aria-labelledby="admin-invites-title">
      <h3 id="admin-invites-title" className="admin-panel-title">
        Nutzer-Einladungen
      </h3>
      <p className="admin-panel-hint">
        Versand über Express: SMTP in <code className="auth-code">.env</code> oder PB-Mail +{' '}
        <code className="auth-code">SMTP_PASS</code>. Ohne SMTP: Eintrag anlegen,{' '}
        <strong>Link kopieren</strong>.
      </p>
      <p className="admin-panel-hint admin-panel-hint--sub">
        Gültigkeit (Tage) nur für den Link; Konto danach normal. Superuser in <code className="auth-code">.env</code>,{' '}
        Details: <code className="auth-code">pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md</code>.
      </p>

      {feedback.text ? (
        <p
          className={
            feedback.type === 'error' ? 'admin-feedback admin-feedback--error' : 'admin-feedback admin-feedback--ok'
          }
          role={feedback.type === 'error' ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}

      <form className="admin-artikel-form admin-invite-form" onSubmit={submitCreate}>
        <div className="admin-form-grid">
          <div className="admin-field admin-field--full">
            <label htmlFor="invite-email">E-Mail des neuen Nutzers</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="admin-field">
            <label htmlFor="invite-role">Rolle nach Registrierung</label>
            <select
              id="invite-role"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="invite-days">Einladung gültig (Tage)</label>
            <input
              id="invite-days"
              type="number"
              min={1}
              max={90}
              value={validDays}
              onChange={(e) => setValidDays(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn-primary" disabled={busy}>
            {busy ? 'Senden …' : 'Einladung per E-Mail senden'}
          </button>
        </div>
      </form>

      <div className="admin-invite-list-head">
        <h4 className="admin-invite-list-title">Letzte Einladungen</h4>
        <button type="button" className="admin-btn-secondary" disabled={listBusy} onClick={() => void loadList()}>
          {listBusy ? '…' : 'Aktualisieren'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="admin-empty">{listBusy ? 'Laden …' : 'Noch keine Einladungen.'}</p>
      ) : (
        <ul className="admin-invite-list">
          {rows.map((r) => {
            const consumed = Boolean(r.consumed_at)
            const exp = r.expires_at ? new Date(r.expires_at) : null
            const expired = exp && exp.getTime() < Date.now()
            return (
              <li key={r.id} className="admin-invite-row">
                <div className="admin-invite-row-main">
                  <span className="admin-invite-email">{r.email}</span>
                  <span className="admin-invite-meta">
                    {consumed
                      ? 'Verwendet'
                      : expired
                        ? 'Abgelaufen'
                        : `gültig bis ${exp ? exp.toLocaleString('de-DE') : '—'}`}
                  </span>
                </div>
                {!consumed && !expired ? (
                  <button
                    type="button"
                    className="admin-btn-secondary admin-invite-copy"
                    onClick={() => void copyLink(r.token)}
                  >
                    Link kopieren
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
