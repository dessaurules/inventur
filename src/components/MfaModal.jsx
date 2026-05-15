import { useCallback, useEffect, useState } from 'react'
import { verifyOTP } from '../lib/auth.js'
import { pb } from '../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections.js'
import { pocketBaseFullErrorMessage } from '../lib/pocketBaseErrorMessage.js'
import {
  authAlertDestructive,
  authButtonLink,
  authButtonPrimary,
  authCardTitle,
  authFieldGroup,
  authFormClass,
  authLabelClass,
  authMutedLink,
  authOtpInputClass,
} from '../lib/authUi.js'
import { cn } from '../lib/cn.js'

const USERS = PB_COLLECTIONS.users

/**
 * @param {object} props
 * @param {{ otpId: string, mfaId: string, email: string }} props.mfaState
 * @param {() => void} props.onSuccess
 * @param {() => void} props.onCancel
 */
export function MfaModal({ mfaState, onSuccess, onCancel }) {
  const [code, setCode] = useState('')
  const [otpId, setOtpId] = useState(mfaState?.otpId ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setOtpId(mfaState?.otpId ?? '')
    setCode('')
    setError('')
  }, [mfaState?.otpId, mfaState?.mfaId, mfaState?.email])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      setError('')
      const c = code.trim()
      if (c.length < 4 || !otpId || !mfaState?.mfaId) return
      setLoading(true)
      try {
        await verifyOTP({ otpId, mfaId: mfaState.mfaId }, c)
        onSuccess()
      } catch (e) {
        setError(pocketBaseFullErrorMessage(e))
        setCode('')
      } finally {
        setLoading(false)
      }
    },
    [code, mfaState?.mfaId, onSuccess, otpId]
  )

  const handleResend = async () => {
    setError('')
    const mail = String(mfaState?.email ?? '').trim()
    if (!mail) return
    setLoading(true)
    try {
      const res = await pb.collection(USERS).requestOTP(mail)
      if (res?.otpId) setOtpId(res.otpId)
    } catch (e) {
      setError(pocketBaseFullErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-modal-title"
    >
      <div className="flex w-full max-w-[425px] flex-col gap-6 rounded-xl border border-border bg-background p-6 shadow-lg">
          <div className="flex flex-col gap-1.5 text-left">
            <h2 id="mfa-modal-title" className={cn(authCardTitle, 'text-xl')}>
              Zweiter Faktor (E-Mail-Code)
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Gib den Einmalcode ein, den wir an <span className="font-medium text-foreground">{mfaState.email}</span>{' '}
              gesendet haben.
            </p>
          </div>
          <form className={authFormClass} onSubmit={handleSubmit}>
            <div className={authFieldGroup}>
              <label htmlFor="mfa-modal-otp" className={authLabelClass}>
                Einmalcode
              </label>
              <input
                id="mfa-modal-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={authOtpInputClass}
                required
              />
            </div>
            {error ? (
              <p className={authAlertDestructive} role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className={authButtonPrimary} disabled={loading || code.trim().length < 4}>
              {loading ? 'Prüfen …' : 'Anmelden mit Code'}
            </button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-4">
            <button type="button" className={authButtonLink} disabled={loading} onClick={() => void handleResend()}>
              Code erneut senden
            </button>
            <button
              type="button"
              className={authMutedLink}
              disabled={loading}
              onClick={() => {
                onCancel()
                setCode('')
                setError('')
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
  )
}
