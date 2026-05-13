import { useCallback, useEffect, useState } from 'react'
import { mapPbRecordToUser, pb } from '../lib/pocketbase'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { loginWithGoogle, loginWithMFA } from '../lib/auth.js'
import { cn } from '../lib/cn.js'
import {
  authAlertDestructive,
  authAlertMuted,
  authButtonLink,
  authButtonOutline,
  authButtonPrimary,
  authCardClass,
  authCardDescription,
  authCardSection,
  authCardTitle,
  authFieldGroup,
  authFormClass,
  authInlineCode,
  authInputClass,
  authLabelClass,
  authMutedLink,
  authPageShell,
  authTabsListClass,
  authTabsTriggerCn,
} from '../lib/authUi.js'
import { MfaModal } from './MfaModal.jsx'

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

  /** @typedef {{ otpId: string, mfaId: string, email: string }} MfaChallenge */
  /** @type {[MfaChallenge | null, (v: MfaChallenge | null) => void]} */
  const [mfaState, setMfaState] = useState(null)

  const [forgotEmail, setForgotEmail] = useState('')

  const [resetToken] = useState(fromUrl.resetToken)
  const [resetPass, setResetPass] = useState('')
  const [resetPass2, setResetPass2] = useState('')

  const [inviteToken, setInviteToken] = useState(fromUrl.inviteToken)
  const [invitePass, setInvitePass] = useState('')
  const [invitePass2, setInvitePass2] = useState('')

  useEffect(() => {
    if (panel !== 'login') setMfaState(null)
  }, [panel])

  const finishPasswordLogin = useCallback((opts = {}) => {
    const skipEmailVerificationCheck = opts.skipEmailVerificationCheck === true
    const record = pb.authStore.model
    const mapped = mapPbRecordToUser(record)
    if (!skipEmailVerificationCheck && mapped && !mapped.emailConfirmed) {
      pb.authStore.clear()
      setMfaState(null)
      setError(
        'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der PocketBase-Mail). Danach erneut anmelden.'
      )
      return false
    }
    setPassword('')
    setMfaState(null)
    setError('')
    return true
  }, [])

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
    setMfaState(null)
    try {
      const result = await loginWithMFA(mail, password, setMfaState)
      if (result?.mfaPending) return
      if (result?.success) finishPasswordLogin()
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    } finally {
      setBusy(false)
    }
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

  const panelSwitch = (next) => {
    setPanel(next)
    setError('')
    setInfo('')
  }

  return (
    <div className={authPageShell}>
      <section className={authCardClass} aria-labelledby="auth-title">
        <div className={authCardSection}>
          <div className="flex flex-col gap-1.5">
            <h1 id="auth-title" className={authCardTitle}>
              Vibe Inventur
            </h1>
            <p className={authCardDescription}>Melde dich mit deinem Konto an.</p>
          </div>

          <div className={authTabsListClass} role="tablist" aria-label="Anmeldeoptionen">
            <button
              type="button"
              role="tab"
              aria-selected={panel === 'login'}
              className={authTabsTriggerCn(panel === 'login')}
              onClick={() => panelSwitch('login')}
            >
              Anmelden
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === 'invite'}
              className={authTabsTriggerCn(panel === 'invite')}
              onClick={() => panelSwitch('invite')}
            >
              Einladung
            </button>
          </div>

          {panel === 'login' && !mfaState ? (
            <form className={authFormClass} onSubmit={handleLoginSubmit}>
              <div className={authFieldGroup}>
                <label htmlFor="login-email" className={authLabelClass}>
                  E-Mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={authInputClass}
                  required
                />
              </div>

              <div className={authFieldGroup}>
                <label htmlFor="login-password" className={authLabelClass}>
                  Passwort
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={authInputClass}
                  required
                />
              </div>

              {error ? (
                <p className={authAlertDestructive} role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className={authAlertMuted} role="status">
                  {info}
                </p>
              ) : null}

              <button type="submit" className={authButtonPrimary} disabled={busy}>
                {busy ? 'Anmelden …' : 'Anmelden'}
              </button>

              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                <button type="button" className={authButtonLink} onClick={() => panelSwitch('forgot')}>
                  Passwort vergessen?
                </button>
                <button
                  type="button"
                  className={authButtonLink}
                  onClick={() => void handleResendVerification()}
                  disabled={busy}
                >
                  Bestätigungsmail erneut senden
                </button>
              </div>
            </form>
          ) : null}

          {panel === 'login' && !mfaState ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                oder
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                className={authButtonOutline}
                disabled={busy}
                onClick={async () => {
                  setError('')
                  setBusy(true)
                  try {
                    await loginWithGoogle()
                  } catch (e) {
                    setError(pocketBaseFullErrorMessage(e))
                  }
                  setBusy(false)
                }}
              >
                <svg width="18" height="18" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path fill="#4285F4" d="M255.9 133.5c0-10.8-.9-18.6-2.8-26.7H130.6v48.4h71.9a64 64 0 0 1-26.7 42.4l41.2 32c24.7-22.8 38.9-56.3 38.9-96.1"/>
                  <path fill="#34A853" d="M130.6 261.1c35.2 0 64.8-11.6 86.4-31.6l-41.2-32a76 76 0 0 1-45.2 13.1 79 79 0 0 1-74.3-54.2L15 188l-.6 1.5A131 131 0 0 0 130.6 261"/>
                  <path fill="#FBBC05" d="M56.3 156.4a80 80 0 0 1 0-51.7V103L15.3 71.3A131 131 0 0 0 14 131a131 131 0 0 0 1.3 57.3z"/>
                  <path fill="#EA4335" d="M130.6 50.5c24.5 0 41 10.6 50.4 19.4L218 34C195.2 13 165.8 0 130.6 0 79.5 0 35.4 29.3 13.9 72l42.2 32.7a79 79 0 0 1 74.5-54.2"/>
                </svg>
                Mit Google anmelden
              </button>
            </div>
          ) : null}

          {panel === 'forgot' ? (
            <form className={authFormClass} onSubmit={handleForgotSubmit}>
              <p className={authCardDescription}>
                Passwort zurücksetzen: Link per E-Mail (PocketBase SMTP).
              </p>
              <div className={authFieldGroup}>
                <label htmlFor="forgot-email" className={authLabelClass}>
                  E-Mail
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className={authInputClass}
                  required
                />
              </div>
              {error ? (
                <p className={authAlertDestructive} role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className={authAlertMuted} role="status">
                  {info}
                </p>
              ) : null}
              <button type="submit" className={authButtonPrimary} disabled={busy}>
                {busy ? 'Senden …' : 'Link anfordern'}
              </button>
              <button
                type="button"
                className={cn(authMutedLink, 'w-full text-center')}
                onClick={() => panelSwitch('login')}
              >
                Zurück zur Anmeldung
              </button>
            </form>
          ) : null}

          {panel === 'reset' ? (
            <form className={authFormClass} onSubmit={handleResetSubmit}>
              <p className={authCardDescription}>Neues Passwort setzen (Link aus der E-Mail).</p>
            {!resetToken ? (
              <div className={authAlertDestructive} role="alert">
                Kein Reset-Token in der URL. Bitte Link aus der PocketBase-Mail verwenden oder in den E-Mail-Templates die
                App-URL mit Parameter <code className={authInlineCode}>pb_reset_token</code> konfigurieren (siehe
                pocketbase/ANLEITUNG_AUTH_INVITES_MFA.md).
              </div>
            ) : null}
              <div className={authFieldGroup}>
                <label htmlFor="reset-pass" className={authLabelClass}>
                  Neues Passwort
                </label>
                <input
                  id="reset-pass"
                  type="password"
                  autoComplete="new-password"
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                  className={authInputClass}
                  required
                  minLength={8}
                />
              </div>
              <div className={authFieldGroup}>
                <label htmlFor="reset-pass2" className={authLabelClass}>
                  Passwort wiederholen
                </label>
                <input
                  id="reset-pass2"
                  type="password"
                  autoComplete="new-password"
                  value={resetPass2}
                  onChange={(e) => setResetPass2(e.target.value)}
                  className={authInputClass}
                  required
                  minLength={8}
                />
              </div>
              {error ? (
                <p className={authAlertDestructive} role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className={authAlertMuted} role="status">
                  {info}
                </p>
              ) : null}
              <button type="submit" className={authButtonPrimary} disabled={busy || !resetToken}>
                {busy ? 'Speichern …' : 'Passwort speichern'}
              </button>
              <button
                type="button"
                className={cn(authMutedLink, 'w-full text-center')}
                onClick={() => panelSwitch('login')}
              >
                Zurück zur Anmeldung
              </button>
            </form>
          ) : null}

          {panel === 'invite' ? (
            <form className={authFormClass} onSubmit={handleInviteSubmit}>
              <p className={authCardDescription}>
                Einladung annehmen und Passwort festlegen. Dafür muss <code className={authInlineCode}>npm run server</code>{' '}
                mit gültigem PocketBase-Superuser laufen (siehe Anleitung).
              </p>
              <div className={authFieldGroup}>
                <label htmlFor="invite-token" className={authLabelClass}>
                  Einladungs-Token (oder per Link eingetragen)
                </label>
                <input
                  id="invite-token"
                  type="text"
                  autoComplete="off"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value.trim())}
                  className={authInputClass}
                  required
                  minLength={16}
                />
              </div>
              <div className={authFieldGroup}>
                <label htmlFor="invite-pass" className={authLabelClass}>
                  Passwort
                </label>
                <input
                  id="invite-pass"
                  type="password"
                  autoComplete="new-password"
                  value={invitePass}
                  onChange={(e) => setInvitePass(e.target.value)}
                  className={authInputClass}
                  required
                  minLength={8}
                />
              </div>
              <div className={authFieldGroup}>
                <label htmlFor="invite-pass2" className={authLabelClass}>
                  Passwort wiederholen
                </label>
                <input
                  id="invite-pass2"
                  type="password"
                  autoComplete="new-password"
                  value={invitePass2}
                  onChange={(e) => setInvitePass2(e.target.value)}
                  className={authInputClass}
                  required
                  minLength={8}
                />
              </div>
              {error ? (
                <p className={authAlertDestructive} role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className={authAlertMuted} role="status">
                  {info}
                </p>
              ) : null}
              <button type="submit" className={authButtonPrimary} disabled={busy}>
                {busy ? 'Konto anlegen …' : 'Konto anlegen'}
              </button>
              <button
                type="button"
                className={cn(authMutedLink, 'w-full text-center')}
                onClick={() => panelSwitch('login')}
              >
                Zurück zur Anmeldung
              </button>
            </form>
          ) : null}
        </div>
      </section>
      {panel === 'login' && mfaState ? (
        <MfaModal
          mfaState={mfaState}
          onSuccess={() => {
            /** Nach erfolgreicher OTP+E-Mail gilt die Mailbox als erreicht — PB kann `verified` trotzdem false liefern. */
            finishPasswordLogin({ skipEmailVerificationCheck: true })
          }}
          onCancel={() => setMfaState(null)}
        />
      ) : null}
    </div>
  )
}

export default LoginView
