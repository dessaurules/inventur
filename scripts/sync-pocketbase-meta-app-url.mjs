/**
 * Setzt PocketBase Settings → Meta → Application URL (= appURL) aus APP_PUBLIC_URL.
 * Gleiche Basis wie im Einladungs-Hook (.env wird per dotenv geladen).
 */
import 'dotenv/config'

const base = String(process.env.POCKETBASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
const url = String(process.env.APP_PUBLIC_URL || '')
  .trim()
  .replace(/\/+$/, '')
const email = String(process.env.POCKETBASE_ADMIN_EMAIL || '').trim()
const password = String(process.env.POCKETBASE_ADMIN_PASSWORD || '')

async function main() {
  if (!base || !url || !email || !password) {
    console.error(
      '[sync-pb-meta-app-url] Bitte setzen: POCKETBASE_URL, APP_PUBLIC_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD (Projekt-.env)'
    )
    process.exit(1)
  }

  let token
  try {
    const r = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    })
    if (!r.ok) {
      console.error('[sync-pb-meta-app-url] Superuser-Login fehlgeschlagen:', r.status, await r.text())
      process.exit(1)
    }
    token = (await r.json()).token
  } catch (e) {
    console.error('[sync-pb-meta-app-url]', e.message || e)
    process.exit(1)
  }

  try {
    const getRes = await fetch(`${base}/api/settings`, { headers: { Authorization: `Bearer ${token}` } })
    if (!getRes.ok) {
      console.error('[sync-pb-meta-app-url] GET /api/settings fehlgeschlagen:', getRes.status)
      process.exit(1)
    }
    const settings = await getRes.json()
    const meta = settings.meta && typeof settings.meta === 'object' ? settings.meta : {}
    const patchRes = await fetch(`${base}/api/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ meta: { ...meta, appURL: url } }),
    })
    if (!patchRes.ok) {
      console.error('[sync-pb-meta-app-url] PATCH fehlgeschlagen:', patchRes.status, await patchRes.text())
      process.exit(1)
    }
    console.log(`[sync-pb-meta-app-url] meta.appURL → ${url}`)
  } catch (e) {
    console.error('[sync-pb-meta-app-url]', e.message || e)
    process.exit(1)
  }
}

await main()
