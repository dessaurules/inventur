/**
 * Einladungs-Mail: niemals dieselbe Basis-URL wie PocketBase —
 * Aufruf führt oft zu JSON „File not found.“ (404 auf der API-/Root-Origin).
 *
 * Priorität: APP_PUBLIC_URL / INVITE_APP_PUBLIC_URL (.env beim `npm run pb`) >
 * Settings → Meta → Application URL > http://localhost:5173
 */
onRecordCreate((e) => {
  const record = e.record
  const email = record.get('email')
  const token = record.get('token')

  const defApp = 'http://localhost:5173'
  const envUrl = String($os.getenv('APP_PUBLIC_URL') || $os.getenv('INVITE_APP_PUBLIC_URL') || '').trim()
  const pbEnv = String($os.getenv('POCKETBASE_URL') || '').trim()
  const metaUrl = String(($app.settings().meta && $app.settings().meta.appURL) || '').trim()

  let appUrl = (envUrl || metaUrl || defApp).replace(/\/+$/, '')

  /** host:port für groben Origin-Vergleich (ohne URL-Parse-Abhängigkeit). */
  function hostPortKey(raw) {
    const s = String(raw || '').trim()
    const m = s.match(/^https?:\/\/([^/?#]+)/i)
    return m ? m[1].toLowerCase() : ''
  }

  const kTarget = hostPortKey(appUrl)
  const kPb = hostPortKey(pbEnv)
  if (kTarget && kPb && kTarget === kPb) {
    console.warn('[invite hook] App-URL entspricht POCKETBASE_URL — Einladungslink auf', defApp, '(bitte APP_PUBLIC_URL setzen)')
    appUrl = defApp
  } else if (!envUrl && /:8090(\/|\?|$)/.test(appUrl)) {
    console.warn('[invite hook] App-URL nutzt typischen PocketBase-Port 8090 — Einladungslink auf', defApp)
    appUrl = defApp
  }

  const sep = appUrl.indexOf('?') >= 0 ? '&' : '?'
  const inviteUrl = `${appUrl}${sep}invite=${encodeURIComponent(token)}`

  const meta = $app.settings().meta || {}
  const appName = meta.appName || 'Inventur'

  try {
    const message = new MailerMessage({
      from: {
        address: meta.senderAddress,
        name: meta.senderName,
      },
      to: [{ address: email }],
      subject: `Einladung: ${appName}`,
      html: `<p>Du wurdest zu <strong>${appName}</strong> eingeladen.</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p style="color:#888;font-size:0.9em">Wenn du diese Einladung nicht erwartet hast, ignoriere diese E-Mail.</p>`,
    })
    $app.newMailClient().send(message)
  } catch (err) {
    console.error('[invite hook] E-Mail Fehler:', err.message)
  }

  e.next()
}, 'user_invites')
