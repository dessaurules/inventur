/**
 * Mandanten-Bootstrap per PocketBase Superuser-API (kein manuelles Dashboard).
 * Aktivierung: TENANT_BOOTSTRAP_ON_START=1 (siehe env.example).
 */

function truthyEnv(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase())
}

async function pbAdminAuth(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.token || null
}

async function pbListPage(baseUrl, token, collection, page, perPage, filter) {
  const u = new URL(`${baseUrl}/api/collections/${encodeURIComponent(collection)}/records`)
  u.searchParams.set('page', String(page))
  u.searchParams.set('perPage', String(perPage))
  if (filter) u.searchParams.set('filter', filter)
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`${collection} list HTTP ${res.status}: ${err.message || res.statusText}`)
  }
  return res.json()
}

async function pbListAll(baseUrl, token, collection, filter = '') {
  const perPage = 200
  const out = []
  let page = 1
  let totalPages = 1
  do {
    const data = await pbListPage(baseUrl, token, collection, page, perPage, filter)
    const items = Array.isArray(data.items) ? data.items : []
    out.push(...items)
    totalPages = Number(data.totalPages) || 1
    page += 1
  } while (page <= totalPages)
  return out
}

async function pbCreate(baseUrl, token, collection, body) {
  const res = await fetch(`${baseUrl}/api/collections/${encodeURIComponent(collection)}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`${collection} create HTTP ${res.status}: ${err.message || JSON.stringify(err)}`)
  }
  return res.json()
}

async function pbPatch(baseUrl, token, collection, id, body) {
  const res = await fetch(
    `${baseUrl}/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`${collection} patch ${id} HTTP ${res.status}: ${err.message || JSON.stringify(err)}`)
  }
  return res.json()
}

function tenantIdEmpty(v) {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'object' && v.id != null) return String(v.id).trim() === ''
  return false
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, steps?: string[], error?: string }>}
 */
export async function runTenantBootstrap(env = process.env) {
  const steps = []

  if (!truthyEnv(env.TENANT_BOOTSTRAP_ON_START)) {
    return { ok: true, skipped: true, reason: 'TENANT_BOOTSTRAP_ON_START nicht gesetzt' }
  }

  const baseUrl = String(env.POCKETBASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
  const email = String(env.POCKETBASE_ADMIN_EMAIL || '').trim()
  const password = String(env.POCKETBASE_ADMIN_PASSWORD || '').trim()
  const usersCol = String(env.POCKETBASE_USERS_COLLECTION || 'users').trim() || 'users'
  const standorteCol = String(env.POCKETBASE_STANDORTE_COLLECTION || 'standorte').trim() || 'standorte'
  const lagerCol = String(env.POCKETBASE_LAGER_COLLECTION || 'lager').trim() || 'lager'
  const unterlagerCol = String(env.POCKETBASE_UNTERLAGER_COLLECTION || 'unterlager').trim() || 'unterlager'

  if (!baseUrl || !email || !password) {
    return {
      ok: false,
      error: 'TENANT_BOOTSTRAP_ON_START gesetzt, aber POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD fehlt.',
    }
  }

  const standortName = String(
    env.DEFAULT_STANDORT_NAME || env.APP_NAME || 'Hauptstandort'
  ).trim() || 'Hauptstandort'

  const linkUsers = truthyEnv(env.BOOTSTRAP_LINK_USERS_WITHOUT_TENANT ?? '1')
  const ensureHauptlager = truthyEnv(env.BOOTSTRAP_ENSURE_HAUPTLAGER ?? '0')

  let token
  try {
    token = await pbAdminAuth(baseUrl, email, password)
  } catch (e) {
    return { ok: false, error: `Superuser-Login: ${e?.message || e}` }
  }
  if (!token) {
    return { ok: false, error: 'Superuser-Login fehlgeschlagen (Zugangsdaten prüfen).' }
  }

  try {
    let standorte = await pbListAll(baseUrl, token, standorteCol, '')
    let standortId = String(env.BOOTSTRAP_STANDORT_ID || '').trim()

    if (standortId) {
      const exists = standorte.some((r) => r.id === standortId)
      if (!exists) {
        return { ok: false, error: `BOOTSTRAP_STANDORT_ID=${standortId} existiert nicht in ${standorteCol}.` }
      }
      steps.push(`Mandant: vorgegeben ${standortId}`)
    } else if (standorte.length === 0) {
      const standortBody = { name: standortName }
      const adr = String(env.DEFAULT_STANDORT_ANSCHRIFT || '').trim()
      if (adr) standortBody.anschrift = adr
      const created = await pbCreate(baseUrl, token, standorteCol, standortBody)
      standortId = created.id
      steps.push(`${standorteCol}: angelegt „${standortName}“ (${standortId})`)
      standorte = [created]
    } else {
      standorte.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'))
      standortId = standorte[0].id
      steps.push(`${standorteCol}: vorhanden (${standorte.length}), nutze „${standorte[0].name || standortId}“ (${standortId})`)
    }

    if (linkUsers) {
      const users = await pbListAll(baseUrl, token, usersCol, '')
      let linked = 0
      for (const u of users) {
        if (tenantIdEmpty(u.tenant_id)) {
          await pbPatch(baseUrl, token, usersCol, u.id, { tenant_id: standortId })
          linked += 1
        }
      }
      if (linked > 0) {
        steps.push(`${usersCol}: tenant_id gesetzt für ${linked} Nutzer ohne Mandant → ${standortId}`)
      } else {
        steps.push(`${usersCol}: alle Einträge hatten bereits tenant_id (oder keine Nutzer).`)
      }
    }

    if (ensureHauptlager) {
      const lagerName = String(env.BOOTSTRAP_LAGER_NAME || 'Hauptlager').trim() || 'Hauptlager'
      const unterName = String(env.BOOTSTRAP_UNTERLAGER_NAME || 'Standard').trim() || 'Standard'

      const lagers = await pbListAll(
        baseUrl,
        token,
        lagerCol,
        `standort = "${standortId}"`
      )
      let lagerId = lagers[0]?.id
      if (!lagerId) {
        const lg = await pbCreate(baseUrl, token, lagerCol, {
          standort: standortId,
          name: lagerName,
          sort_index: 0,
          aktiv: true,
        })
        lagerId = lg.id
        steps.push(`${lagerCol}: „${lagerName}“ angelegt (${lagerId})`)
      } else {
        steps.push(`${lagerCol}: vorhanden unter Mandant (${lagers.length}), nutze ${lagerId}`)
      }

      const unters = await pbListAll(
        baseUrl,
        token,
        unterlagerCol,
        `lager = "${lagerId}"`
      )
      if (unters.length === 0) {
        const ul = await pbCreate(baseUrl, token, unterlagerCol, {
          lager: lagerId,
          name: unterName,
          sort_index: 0,
          aktiv: true,
        })
        steps.push(`${unterlagerCol}: „${unterName}“ angelegt (${ul.id})`)
      } else {
        steps.push(`${unterlagerCol}: bereits ${unters.length} Eintrag/Einträge unter diesem Lager.`)
      }
    }

    return { ok: true, steps }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), steps }
  }
}
