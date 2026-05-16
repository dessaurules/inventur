/**
 * MFA / E-Mail-OTP-Anmeldung (PocketBase Auth Collection „users“).
 *
 * WICHTIG: Im PocketBase Dashboard aktivieren:
 * Collections → users → Auth options → OTP aktivieren → MFA aktivieren
 * MFA Rule (nur Admins): role = "admin"
 * OTP duration: 300, MFA duration: 1800
 */
import { pb } from './pocketbase.js'
import { PB_COLLECTIONS } from './pocketbaseCollections.js'

const USERS = PB_COLLECTIONS.users

export async function loginWithGoogle() {
  // Popup synchron öffnen (noch im User-Gesture-Kontext), damit Chrome es nicht blockiert
  const popup = window.open('about:blank', 'google_oauth', 'width=600,height=700,resizable')
  if (popup) {
    popup.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
        '<body style="background:#fff;font-family:sans-serif;padding:2rem;text-align:center">' +
        '<p style="margin-top:3rem;color:#555">Verbinde mit Google…</p>' +
        '</body></html>',
    )
    popup.document.close()
  }
  return pb.collection(USERS).authWithOAuth2({
    provider: 'google',
    urlCallback: (url) => {
      if (!popup || popup.closed) return
      // meta-refresh navigiert ohne Script-Ausführung – zuverlässiger als location.href oder document.write-Script
      const safeUrl = url.replace(/"/g, '%22')
      popup.document.open()
      popup.document.write(
        '<!DOCTYPE html><html><head>' +
          '<meta charset="utf-8">' +
          '<meta http-equiv="refresh" content="0; url=' + safeUrl + '">' +
          '</head><body style="background:#fff;font-family:sans-serif;padding:2rem;text-align:center">' +
          '<p style="margin-top:3rem;color:#555">Weiterleitung zu Google…</p>' +
          '<p style="font-size:0.85rem;margin-top:1rem">' +
          '<a href="' + safeUrl + '">Hier klicken falls keine Weiterleitung</a></p>' +
          '</body></html>',
      )
      popup.document.close()
    },
  })
}

/**
 * @typedef {{ otpId: string, mfaId: string, email: string }} MfaChallengeState
 */

/**
 * @param {string} email
 * @param {string} password
 * @param {(state: MfaChallengeState) => void} onMfaRequired
 * @returns {Promise<{ success: true } | { mfaPending: true }>}
 */
export async function loginWithMFA(email, password, onMfaRequired) {
  const em = String(email ?? '').trim()
  const pw = String(password ?? '')
  try {
    await pb.collection(USERS).authWithPassword(em, pw)
    return { success: true }
  } catch (err) {
    const mfaRaw = err?.response?.mfaId
    if (mfaRaw == null || mfaRaw === '') throw err
    const mfaId = String(mfaRaw).trim()
    if (!mfaId) throw err

    const { otpId } = await pb.collection(USERS).requestOTP(em)
    if (!otpId) throw new Error('OTP konnte nicht angefordert werden (keine otpId).')
    onMfaRequired({ otpId, mfaId, email: em })
    return { mfaPending: true }
  }
}

/**
 * @param {{ otpId: string, mfaId: string }} challenge
 * @param {string} code
 * @returns {Promise<{ success: true }>}
 */
export async function verifyOTP(challenge, code) {
  const otpId = String(challenge?.otpId ?? '').trim()
  const mfaId = String(challenge?.mfaId ?? '').trim()
  const c = String(code ?? '').trim()
  /** `authWithOTP(id, otp, { mfaId })` merged `mfaId` nicht in den JSON-Body (nur Query) — MFA wurde serverseitig nicht korrekt abgeschlossen. */
  const path = `/api/collections/${encodeURIComponent(USERS)}/auth-with-otp`
  const body = /** @type {Record<string, string>} */ ({ otpId, password: c })
  if (mfaId) body.mfaId = mfaId
  const authData = await pb.send(path, { method: 'POST', body })
  const svc = pb.collection(USERS)
  const rawRec = authData?.record ?? null
  const record = typeof svc.decode === 'function' ? svc.decode(rawRec) : rawRec
  pb.authStore.save(String(authData?.token ?? '').trim(), record ?? null)
  return { success: true }
}
