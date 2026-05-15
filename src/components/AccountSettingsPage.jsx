import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pb } from '../lib/pocketbase'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage'
import { avatarInitials } from '../lib/avatarInitials'

const ROLE_LABELS = {
  admin: 'Administrator',
  lagerleiter: 'Lagerleiter',
  inventur: 'Inventur',
  magazin_readonly: 'Magazin (nur lesen)',
}

const USERS = PB_COLLECTIONS.users

const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function isAllowedProfileImage(file) {
  if (!file) return false
  if (file.type && PROFILE_IMAGE_TYPES.has(file.type)) return true
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name || '')
}

/**
 * Account: Übersicht, Profil (Vor-/Nachname, Profilbild), Passwort, E-Mail-Änderung (PocketBase).
 */
export default function AccountSettingsPage({ user }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [removeImage, setRemoveImage] = useState(false)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)

  const [googleLinked, setGoogleLinked] = useState(null)
  const [googleLinking, setGoogleLinking] = useState(false)

  const [imagePreviewUrl, setImagePreviewUrl] = useState(null)

  const [feedback, setFeedback] = useState({ type: '', text: '' })

  const [dropActive, setDropActive] = useState(false)
  const dropDepthRef = useRef(0)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    setFirstName(user.firstName ?? '')
    setLastName(user.lastName ?? '')
    setImageFile(null)
    setRemoveImage(false)
    setOldPassword('')
    setNewPassword('')
    setNewPassword2('')
    setNewEmail('')
  }, [user?.id, user?.firstName, user?.lastName, user?.profileImage, user?.email])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const initials = useMemo(
    () => avatarInitials(firstName, lastName, user?.email),
    [firstName, lastName, user?.email]
  )

  const showOk = useCallback((text) => setFeedback({ type: 'ok', text }), [])
  const showErr = useCallback((text) => setFeedback({ type: 'error', text }), [])

  const applyLocalImageFile = useCallback(
    (file) => {
      if (!file) {
        setImageFile(null)
        return
      }
      if (!isAllowedProfileImage(file)) {
        showErr('Bitte nur JPEG, PNG, WebP oder GIF verwenden.')
        return
      }
      setFeedback({ type: '', text: '' })
      setImageFile(file)
      setRemoveImage(false)
    },
    [showErr]
  )

  const onDropZoneDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const types = e.dataTransfer?.types
    if (!types || ![...types].includes('Files')) return
    dropDepthRef.current += 1
    setDropActive(true)
  }, [])

  const onDropZoneDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dropDepthRef.current -= 1
    if (dropDepthRef.current <= 0) {
      dropDepthRef.current = 0
      setDropActive(false)
    }
  }, [])

  const onDropZoneDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDropZoneDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropDepthRef.current = 0
      setDropActive(false)
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      applyLocalImageFile(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [applyLocalImageFile]
  )

  useEffect(() => {
    if (!user?.id) return
    pb.collection(USERS).listExternalAuths(user.id)
      .then((auths) => setGoogleLinked(auths.some((a) => a.provider === 'google')))
      .catch(() => setGoogleLinked(false))
  }, [user?.id])

  const refreshAuth = useCallback(async () => {
    await pb.collection(USERS).authRefresh()
  }, [])

  const handleLinkGoogle = async () => {
    setFeedback({ type: '', text: '' })
    setGoogleLinking(true)
    try {
      await pb.collection(USERS).linkExternalAuth({ provider: 'google' })
      setGoogleLinked(true)
      showOk('Google-Konto erfolgreich verknüpft.')
    } catch (err) {
      showErr(pocketBaseFullErrorMessage(err))
    } finally {
      setGoogleLinking(false)
    }
  }

  const handleUnlinkGoogle = async () => {
    setFeedback({ type: '', text: '' })
    setGoogleLinking(true)
    try {
      await pb.collection(USERS).unlinkExternalAuth(user.id, 'google')
      setGoogleLinked(false)
      showOk('Google-Konto getrennt.')
    } catch (err) {
      showErr(pocketBaseFullErrorMessage(err))
    } finally {
      setGoogleLinking(false)
    }
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!user?.id) return
    setFeedback({ type: '', text: '' })
    setProfileSaving(true)
    try {
      const fn = firstName.trim()
      const ln = lastName.trim()
      if (imageFile) {
        // Objekt + File: PocketBase-JS baut daraus zuverlässig multipart/form-data (nicht manuell FormData).
        await pb.collection(USERS).update(user.id, {
          first_name: fn,
          last_name: ln,
          profile_image: imageFile,
        })
      } else {
        const body = { first_name: fn, last_name: ln }
        if (removeImage) body.profile_image = null
        await pb.collection(USERS).update(user.id, body)
      }
      await refreshAuth()
      setImageFile(null)
      setRemoveImage(false)
      showOk('Profil gespeichert.')
    } catch (err) {
      showErr(pocketBaseFullErrorMessage(err))
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    if (!user?.id) return
    setFeedback({ type: '', text: '' })
    if (newPassword !== newPassword2) {
      showErr('Neues Passwort und Wiederholung stimmen nicht überein.')
      return
    }
    if (newPassword.length < 8) {
      showErr('Neues Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    setPasswordSaving(true)
    try {
      await pb.collection(USERS).update(user.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: newPassword2,
      })
      await refreshAuth()
      setOldPassword('')
      setNewPassword('')
      setNewPassword2('')
      showOk('Passwort geändert.')
    } catch (err) {
      showErr(pocketBaseFullErrorMessage(err))
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleEmailChangeRequest = async (e) => {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed) {
      showErr('Bitte eine neue E-Mail-Adresse eingeben.')
      return
    }
    setFeedback({ type: '', text: '' })
    setEmailSaving(true)
    try {
      await pb.collection(USERS).requestEmailChange(trimmed)
      setNewEmail('')
      showOk('Bestätigungs-Link wurde an die neue Adresse gesendet (sofern SMTP in PocketBase korrekt ist).')
    } catch (err) {
      showErr(pocketBaseFullErrorMessage(err))
    } finally {
      setEmailSaving(false)
    }
  }

  if (!user) return null
  const roleLabel = ROLE_LABELS[user.role] || user.role
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()

  return (
    <div className="admin-view account-settings-page">
      <header className="account-settings-header">
        <div className="account-settings-header-text">
          <h2 className="account-settings-title" id="account-page-title">
            Account
          </h2>
          <p className="account-settings-lead">
            PocketBase – Änderungen übernehmen die Sitzung nach dem Speichern.
          </p>
        </div>
        <dl className="account-settings-meta" aria-label="Kontoübersicht">
          <div>
            <dt>Name</dt>
            <dd>{displayName || '—'}</dd>
          </div>
          <div>
            <dt>E-Mail</dt>
            <dd>{user.email || '—'}</dd>
          </div>
          <div>
            <dt>Rolle</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt>Verifiziert</dt>
            <dd>{user.emailConfirmed || user.verified ? 'Ja' : 'Nein'}</dd>
          </div>
        </dl>
      </header>

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

      <div className="account-settings-grid">
        <section
          className="account-settings-panel account-settings-panel--profile"
          aria-labelledby="account-profile-title"
        >
          <h3 id="account-profile-title" className="account-settings-panel-title">
            Profil
          </h3>
          <form className="account-settings-form" onSubmit={handleSaveProfile}>
            <div className="account-settings-profile-row">
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="account-settings-avatar"
                />
              ) : user.profileImageThumbUrl && !removeImage ? (
                <img
                  src={user.profileImageThumbUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="account-settings-avatar"
                />
              ) : (
                <div
                  className="account-settings-avatar-placeholder account-settings-avatar-initials"
                  role="img"
                  aria-label={`Avatar-Initialen: ${initials}`}
                >
                  {initials}
                </div>
              )}
              <div className="account-settings-profile-fields">
                <div className="account-settings-two-cols">
                  <div className="account-settings-field">
                    <label className="account-settings-label" htmlFor="account-first-name">
                      Vorname
                    </label>
                    <input
                      id="account-first-name"
                      className="account-settings-input"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(ev) => setFirstName(ev.target.value)}
                    />
                  </div>
                  <div className="account-settings-field">
                    <label className="account-settings-label" htmlFor="account-last-name">
                      Nachname
                    </label>
                    <input
                      id="account-last-name"
                      className="account-settings-input"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(ev) => setLastName(ev.target.value)}
                    />
                  </div>
                </div>
                <div className="account-settings-field account-settings-dropzone-wrap">
                  <span className="account-settings-label" id="account-profile-image-label">
                    Bild
                  </span>
                  <div
                    className={`account-settings-dropzone${dropActive ? ' account-settings-dropzone--active' : ''}`}
                    onDragEnter={onDropZoneDragEnter}
                    onDragLeave={onDropZoneDragLeave}
                    onDragOver={onDropZoneDragOver}
                    onDrop={onDropZoneDrop}
                  >
                    <input
                      ref={fileInputRef}
                      id="account-profile-image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="account-settings-file-input-sr"
                      aria-labelledby="account-profile-image-label"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0]
                        applyLocalImageFile(f || null)
                      }}
                    />
                    <label htmlFor="account-profile-image" className="account-settings-dropzone-label">
                      <span className="account-settings-dropzone-hint">
                        Ziehen oder{' '}
                        <span className="account-settings-dropzone-browse">wählen</span>
                        <span className="account-settings-dropzone-formats"> · JPEG, PNG, WebP, GIF</span>
                      </span>
                    </label>
                  </div>
                </div>
                {user.profileImage ? (
                  <label className="account-settings-remove-image">
                    <input
                      type="checkbox"
                      checked={removeImage}
                      disabled={Boolean(imageFile)}
                      onChange={(ev) => setRemoveImage(ev.target.checked)}
                    />{' '}
                    Profilbild entfernen
                  </label>
                ) : null}
              </div>
            </div>
            <div className="account-settings-actions">
              <button
                type="submit"
                className="account-settings-btn account-settings-btn--primary"
                disabled={profileSaving}
              >
                {profileSaving ? 'Speichern …' : 'Profil speichern'}
              </button>
            </div>
          </form>
        </section>

        <section className="account-settings-panel" aria-labelledby="account-password-title">
          <h3 id="account-password-title" className="account-settings-panel-title">
            Passwort
          </h3>
          <form className="account-settings-form" onSubmit={handlePassword}>
            <div className="account-settings-field">
              <label className="account-settings-label" htmlFor="account-old-pw">
                Aktuell
              </label>
              <input
                id="account-old-pw"
                className="account-settings-input"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(ev) => setOldPassword(ev.target.value)}
              />
            </div>
            <div className="account-settings-field">
              <label className="account-settings-label" htmlFor="account-new-pw">
                Neu
              </label>
              <input
                id="account-new-pw"
                className="account-settings-input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
              />
            </div>
            <div className="account-settings-field">
              <label className="account-settings-label" htmlFor="account-new-pw2">
                Wiederholen
              </label>
              <input
                id="account-new-pw2"
                className="account-settings-input"
                type="password"
                autoComplete="new-password"
                value={newPassword2}
                onChange={(ev) => setNewPassword2(ev.target.value)}
              />
            </div>
            <div className="account-settings-actions">
              <button
                type="submit"
                className="account-settings-btn account-settings-btn--primary"
                disabled={passwordSaving}
              >
                {passwordSaving ? 'Speichern …' : 'Passwort setzen'}
              </button>
            </div>
          </form>
        </section>

        <section className="account-settings-panel" aria-labelledby="account-email-title">
          <h3 id="account-email-title" className="account-settings-panel-title">
            E-Mail wechseln
          </h3>
          <p className="account-settings-panel-hint">
            Bestätigungslink an die neue Adresse; die alte bleibt aktiv bis zur Bestätigung.
          </p>
          <form className="account-settings-form" onSubmit={handleEmailChangeRequest}>
            <div className="account-settings-field">
              <label className="account-settings-label" htmlFor="account-new-email">
                Neu
              </label>
              <input
                id="account-new-email"
                className="account-settings-input"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(ev) => setNewEmail(ev.target.value)}
              />
            </div>
            <div className="account-settings-actions">
              <button
                type="submit"
                className="account-settings-btn account-settings-btn--primary"
                disabled={emailSaving}
              >
                {emailSaving ? 'Senden …' : 'Link anfordern'}
              </button>
            </div>
          </form>
        </section>
        <section className="account-settings-panel" aria-labelledby="account-google-title">
          <h3 id="account-google-title" className="account-settings-panel-title">
            Google-Konto
          </h3>
          <p className="account-settings-panel-hint">
            Mit Google verknüpfen, um dich künftig per Google-Login anzumelden.
          </p>
          <div className="account-settings-actions">
            {googleLinked === null ? (
              <span className="account-settings-panel-hint">Lade …</span>
            ) : googleLinked ? (
              <button
                type="button"
                className="account-settings-btn"
                disabled={googleLinking}
                onClick={handleUnlinkGoogle}
              >
                {googleLinking ? 'Bitte warten …' : 'Google-Konto trennen'}
              </button>
            ) : (
              <button
                type="button"
                className="account-settings-btn account-settings-btn--primary"
                disabled={googleLinking}
                onClick={handleLinkGoogle}
              >
                {googleLinking ? 'Bitte warten …' : 'Google-Konto verknüpfen'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
