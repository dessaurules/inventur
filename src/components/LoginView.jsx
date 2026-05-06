import { useCallback, useEffect, useState } from 'react'
import { mapPbRecordToUser, pb } from '../lib/pocketbase'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'

const USERS = PB_COLLECTIONS.users

function readInitialUrlFlags() {
  if (typeof window === 'undefined') {
    return { inviteToken: '', resetToken: '' }
  }
  try {
    const url = new URL(window.location.href)
    const invite = (url.searchParams.get('invite') || '').trim()
    const reset =
      (url.searchParams.get('pb_reset_token') || '').trim() ||
      (url.searchParams.get('token') || '').trim() ||
      (url.searchParams.get('resetToken') || '').trim()
    if (invite) {
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url)
    }
    if (reset) {
      url.searchParams.delete('pb_reset_token')
      url.searchParams.delete('token')
      url.searchParams.delete('resetToken')
      window.history.replaceState({}, '', url)
    }
    return { inviteToken: invite, resetToken: reset }
  } catch {
    return { inviteToken: '', resetToken: '' }
  }
}

async function postJson(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = data.error || data.message || `HTTP ${r.status}`
    throw new Error(typeof msg === 'string' ? msg : pocketBaseFullErrorMessage({ response: data }))
  }
  return data
}

/**
 * Login inkl. E-Mail-Verifikationshinweis, Passwort zurücksetzen, MFA (Passwort + OTP) und Einladungsannahme.
 */
function LoginView() {
  const [fromUrl] = useState(() => readInitialUrlFlags())
  const [panel, setPanel] = useState(() =>
    fromUrl.inviteToken ? 'invite' : fromUrl.resetToken ? 'reset' : 'login'
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [mfaId, setMfaId] = useState('')
  const [mfaEmail, setMfaEmail] = useState('')
  const [otpId, setOtpId] = useState('')
  const [otpCode, setOtpCode] = useState('')

  const [forgotEmail, setForgotEmail] = useState('')

  const [resetToken] = useState(fromUrl.resetToken)
  const [resetPass, setResetPass] = useState('')
  const [resetPass2, setResetPass2] = useState('')

  const [inviteToken, setInviteToken] = useState(fromUrl.inviteToken)
  const [invitePass, setInvitePass] = useState('')
  const [invitePass2, setInvitePass2] = useState('')

  const clearMfa = useCallback(() => {
    setMfaId('')
    setMfaEmail('')
    setOtpId('')
    setOtpCode('')
  }, [])

  const sendOtpForMfa = useCallback(async (mail) => {
    const m = String(mail || '').trim()
    if (!m) return
    const res = await pb.collection(USERS).requestOTP(m)
    if (res?.otpId) setOtpId(res.otpId)
  }, [])

  useEffect(() => {
    if (mfaId && mfaEmail && !otpId) {
      void sendOtpForMfa(mfaEmail).catch(() => {
        /* OTP-Anforderung optional; Nutzer kann erneut senden */
      })
    }
  }, [mfaId, mfaEmail, otpId, sendOtpForMfa])

  const finishPasswordLogin = useCallback(() => {
    const record = pb.authStore.model
    const mapped = mapPbRecordToUser(record)
    if (mapped && !mapped.emailConfirmed) {
      pb.authStore.clear()
      setError(
        'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der PocketBase-Mail). Danach erneut anmelden.'
      )
      return false
    }
    setPassword('')
    clearMfa()
    setError('')
    return true
  }, [clearMfa])

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    const mail = email.trim()
    if (!mail || !password) {
      setError('Bitte E-Mail und Passwort eingeben.')
      return
    }
    setBusy(true)
    clearMfa()
    try {
      await pb.collection(USERS).authWithPassword(mail, password)
      finishPasswordLogin()
    } catch (e) {
      const raw = e?.response ?? e?.data ?? e?.originalError?.response ?? {}
      const mid = raw.mfaId
      if (mid) {
        setMfaId(mid)
        setMfaEmail(mail)
        setOtpId('')
        setOtpCode('')
        setInfo('Zweiter Faktor: Bitte den Code aus der E-Mail eingeben (oder „Code senden“).')
        setBusy(false)
        return
      }
      setError(pocketBaseFullErrorMessage(e))
    }
    setBusy(false)
  }

  const handleMfaSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!mfaId || !otpId || !otpCode.trim()) {
      setError('Bitte den Code aus der E-Mail eingeben.')
      return
    }
    setBusy(true)
    try {
      await pb.collection(USERS).authWithOTP(otpId, otpCode.trim(), { mfaId })
      finishPasswordLogin()
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    }
    setBusy(false)
  }

  const handleForgotSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    const mail = forgotEmail.trim()
    if (!mail) {
      setError('Bitte E-Mail eingeben.')
      return
    }
    setBusy(true)
    try {
      await pb.collection(USERS).requestPasswordReset(mail)
      setInfo(
        'Anfrage wurde akzeptiert. Wenn ein Konto existiert, sendet PocketBase die Mail – SMTP muss im PocketBase-Admin unter Settings → Mail eingetragen sein (nicht nur .env im Projekt). Terminal-Log von PocketBase prüfen; sonst Spam-Ordner.'
      )
      setPanel('login')
      setForgotEmail('')
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    }
    setBusy(false)
  }

  const handleResetSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    if (!resetToken) {
      setError('Kein gültiger Reset-Link.')
      return
    }
    if (resetPass.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (resetPass !== resetPass2) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    try {
      await pb.collection(USERS).confirmPasswordReset(resetToken, resetPass, resetPass2)
      setInfo('Passwort wurde geändert. Du kannst dich jetzt anmelden.')
      setPanel('login')
      setResetPass('')
      setResetPass2('')
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    }
    setBusy(false)
  }

  const handleInviteSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')
    if (!inviteToken || inviteToken.length < 16) {
      setError('Ungültiger Einladungslink.')
      return
    }
    if (invitePass.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (invitePass !== invitePass2) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    try {
      await postJson('/api/invite/accept', {
        token: inviteToken,
        password: invitePass,
        passwordConfirm: invitePass2,
      })
      setInfo('Konto angelegt. Melde dich mit E-Mail und Passwort an (E-Mail ggf. zuerst bestätigen).')
      setPanel('login')
      setInviteToken('')
      setInvitePass('')
      setInvitePass2('')
    } catch (e) {
      setError(e?.message || 'Einladung konnte nicht angenommen werden.')
    }
    setBusy(false)
  }

  const handleResendVerification = async () => {
    const mail = email.trim()
    if (!mail) {
      setError('Zuerst E-Mail im Feld oben eintragen.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await pb.collection(USERS).requestVerification(mail)
      setInfo(
        'Anfrage wurde akzeptiert. Versand läuft über PocketBase (Settings → Mail). Ohne SMTP dort kommt keine Mail; Fehler oft im Terminal-Log des PocketBase-Prozesses.'
      )
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    }
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth-title">
          Inventur Login
        </h1>
        <p className="auth-lead">Melde dich mit deinem PocketBase-Benutzer an.</p>

        <div className="auth-tabs" role="tablist" aria-label="Anmeldeoptionen">
          <button
            type="button"
            role="tab"
            aria-selected={panel === 'login'}
            className={`auth-tab${panel === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => {
              setPanel('login')
              setError('')
              setInfo('')
            }}
          >
            Anmelden
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panel === 'invite'}
            className={`auth-tab${panel === 'invite' ? ' auth-tab--active' : ''}`}
            onClick={() => {
              setPanel('invite')
              setError('')
              setInfo('')
            }}
          >
            Einladung
          </button>
        </div>

        {panel === 'login' && !mfaId ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <label htmlFor="login-email">E-Mail</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="login-password">Passwort</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="auth-info" role="status">
                {info}
              </p>
            ) : null}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'Anmelden …' : 'Anmelden'}
            </button>

            <div className="auth-secondary-actions">
              <button type="button" className="auth-linkish" onClick={() => setPanel('forgot')}>
                Passwort vergessen?
              </button>
              <button type="button" className="auth-linkish" onClick={handleResendVerification} disabled={busy}>
                Bestätigungsmail erneut senden
              </button>
            </div>
          </form>
        ) : null}

        {panel === 'login' && mfaId ? (
          <form className="auth-form" onSubmit={handleMfaSubmit}>
            <p className="auth-lead auth-lead--tight">
              Zweiter Faktor (MFA): Code aus der E-Mail an <strong>{mfaEmail}</strong>
            </p>
            {info ? (
              <p className="auth-info" role="status">
                {info}
              </p>
            ) : null}
            <label htmlFor="mfa-otp">Einmalcode</label>
            <input
              id="mfa-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
            />
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'Prüfen …' : 'Anmelden mit Code'}
            </button>
            <div className="auth-secondary-actions">
              <button
                type="button"
                className="auth-linkish"
                disabled={busy}
                onClick={async () => {
                  setError('')
                  setBusy(true)
                  try {
                    await sendOtpForMfa(mfaEmail)
                    setInfo('Neuer Code wurde angefordert.')
                  } catch (e) {
                    setError(pocketBaseFullErrorMessage(e))
                  }
                  setBusy(false)
                }}
              >
                Code erneut senden
              </button>
              <button
                type="button"
                className="auth-linkish"
                onClick={() => {
                  clearMfa()
                  setInfo('')
                  setError('')
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : null}

        {panel === 'forgot' ? (
          <form className="auth-form" onSubmit={handleForgotSubmit}>
            <p className="auth-lead auth-lead--tight">Passwort zurücksetzen: Link per E-Mail (PocketBase SMTP).</p>
            <label htmlFor="forgot-email">E-Mail</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="auth-info" role="status">
                {info}
              </p>
            ) : null}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'Senden …' : 'Link anfordern'}
            </button>
            <button
              type="button"
              className="auth-linkish auth-linkish--block"
              onClick={() => {
                setPanel('login')
                setError('')
              }}
            >
              Zurück zur Anmeldung
            </button>
          </form>
        ) : null}

        {panel === 'reset' ? (
          <form className="auth-form" onSubmit={handleResetSubmit}>
            <p className="auth-lead auth-lead--tight">Neues Passwort setzen (Link aus der E-Mail).</p>
            {!resetToken ? (
              <p className="auth-error" role="alert">
                Kein Reset-Token in der URL. Bitte Link aus der PocketBase-Mail verwenden oder in den
                E-Mail-Templates die App-URL mit Parameter <code className="auth-code">pb_reset_token</code>{' '}
                konfigurieren (siehe pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md).
              </p>
            ) : null}
            <label htmlFor="reset-pass">Neues Passwort</label>
            <input
              id="reset-pass"
              type="password"
              autoComplete="new-password"
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              required
              minLength={8}
            />
            <label htmlFor="reset-pass2">Passwort wiederholen</label>
            <input
              id="reset-pass2"
              type="password"
              autoComplete="new-password"
              value={resetPass2}
              onChange={(e) => setResetPass2(e.target.value)}
              required
              minLength={8}
            />
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="auth-info" role="status">
                {info}
              </p>
            ) : null}
            <button type="submit" className="auth-submit" disabled={busy || !resetToken}>
              {busy ? 'Speichern …' : 'Passwort speichern'}
            </button>
            <button
              type="button"
              className="auth-linkish auth-linkish--block"
              onClick={() => {
                setPanel('login')
                setError('')
              }}
            >
              Zurück zur Anmeldung
            </button>
          </form>
        ) : null}

        {panel === 'invite' ? (
          <form className="auth-form" onSubmit={handleInviteSubmit}>
            <p className="auth-lead auth-lead--tight">
              Einladung annehmen und Passwort festlegen. Dafür muss{' '}
              <code className="auth-code">npm run server</code> mit gültigem PocketBase-Superuser laufen
              (siehe Anleitung).
            </p>
            <label htmlFor="invite-token">Einladungs-Token (oder per Link eingetragen)</label>
            <input
              id="invite-token"
              type="text"
              autoComplete="off"
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value.trim())}
              required
              minLength={16}
            />
            <label htmlFor="invite-pass">Passwort</label>
            <input
              id="invite-pass"
              type="password"
              autoComplete="new-password"
              value={invitePass}
              onChange={(e) => setInvitePass(e.target.value)}
              required
              minLength={8}
            />
            <label htmlFor="invite-pass2">Passwort wiederholen</label>
            <input
              id="invite-pass2"
              type="password"
              autoComplete="new-password"
              value={invitePass2}
              onChange={(e) => setInvitePass2(e.target.value)}
              required
              minLength={8}
            />
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="auth-info" role="status">
                {info}
              </p>
            ) : null}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'Konto anlegen …' : 'Konto anlegen'}
            </button>
            <button
              type="button"
              className="auth-linkish auth-linkish--block"
              onClick={() => {
                setPanel('login')
                setError('')
              }}
            >
              Zurück zur Anmeldung
            </button>
          </form>
        ) : null}
      </section>
    </div>
  )
}

export default LoginView
