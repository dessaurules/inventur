/** Rohentität der PocketBase-Fehlerantwort (SDK / Fetch-Wrapper). */
export function pocketBaseMergedResponse(e) {
  let r = e?.response
  if ((!r || typeof r !== 'object') && e?.originalError?.response) {
    r = e.originalError.response
  }
  if (typeof r === 'string') {
    try {
      return JSON.parse(r)
    } catch {
      return {}
    }
  }
  return r && typeof r === 'object' ? r : {}
}

/** Standard-404-Text des PocketBase-JS-SDK (englisch) → deutsch für Toasts. */
function isPocketBaseNotFoundMessage(text) {
  const t = String(text ?? '').trim().toLowerCase()
  return (
    t.includes("requested resource wasn't found") ||
    t === 'not found' ||
    t === 'not found.'
  )
}

/** Lesbare Fehlermeldung aus PocketBase ClientResponseError / Fetch-Fehler. */
export function pocketBaseErrorMessage(e) {
  if (!e) return 'Unbekannter Fehler.'
  const resp = pocketBaseMergedResponse(e)
  const msg = resp.message ?? e.message ?? e.originalError?.message
  let text = typeof msg === 'string' ? msg : msg != null ? JSON.stringify(msg) : ''
  text = text.trim() || 'Anfrage fehlgeschlagen.'
  const status = e.status ?? resp.status ?? e.originalError?.status

  if (isPocketBaseNotFoundMessage(text)) {
    return 'Der angeforderte Datensatz wurde nicht gefunden (404). Mögliche Ursachen: falsche oder gelöschte ID, falsche Collection, oder keine Lese-/Schreibberechtigung (API-Regeln in PocketBase).'
  }
  if (status === 404) {
    return `${text} (HTTP 404 — Eintrag nicht gefunden oder durch API-Regeln nicht sichtbar.)`
  }
  if (status === 403 || status === 401) {
    return `${text} In PocketBase die API Rules der betroffenen Collection prüfen (u. a. Create, List, View).`
  }
  /** PocketBase liefert bei internen Fehlern oft nur diese generische englische Meldung (meist HTTP 5xx). */
  const textTrim = String(text).trim()
  const genericSomething =
    /^something went wrong\.?$/i.test(textTrim) ||
    /^something went wrong$/i.test(textTrim) ||
    /something went wrong.*processing your request/i.test(textTrim)
  if (genericSomething) {
    const st = typeof status === 'number' && status > 0 ? status : null
    const urlHint = typeof e.url === 'string' && e.url ? ` Anfrage: ${e.url}` : ''
    if (st && st >= 500) {
      return `Serverfehler (HTTP ${st}): „Something went wrong.“ — In der Konsole, in der „npm run pb“ läuft, nach Go-Panic oder JS-Hook-Fehlern suchen; ggf. PB neu starten.${urlHint}`
    }
    if (st) {
      return `HTTP ${st}: Something went wrong.${urlHint} (PocketBase-Log / Admin → Logs prüfen.)`
    }
    return `Something went wrong.${urlHint} (HTTP-Status siehe Netzwerk-Tab; PocketBase-Terminal prüfen.)`
  }
  return text
}

/**
 * PocketBase liefert bei 400 oft unter `response.data` Feld-spezifische Meldungen
 * (z. B. unbekanntes Feld, Validierung).
 */
export function pocketBaseValidationDetails(e) {
  const resp = pocketBaseMergedResponse(e)
  if (!resp || typeof resp !== 'object') return ''
  const inner = resp.data
  if (!inner || typeof inner !== 'object') return ''
  const parts = []
  for (const [key, val] of Object.entries(inner)) {
    if (val && typeof val === 'object' && typeof val.message === 'string') {
      const code = typeof val.code === 'string' ? ` [${val.code}]` : ''
      parts.push(`${key}${code}: ${val.message}`)
    } else if (typeof val === 'string') {
      parts.push(`${key}: ${val}`)
    }
  }
  if (parts.length) return parts.join('; ')
  const keys = Object.keys(inner)
  if (keys.length) {
    try {
      return JSON.stringify(inner)
    } catch {
      return ''
    }
  }
  return ''
}

/** PocketBase-Standardzeilen (oft ohne `data`) → deutsch für Toasts. */
function pocketBaseGenericRecordMessageDe(englishBase) {
  const t = String(englishBase ?? '').trim()
  if (/^failed to create record\.?$/i.test(t)) return 'Datensatz konnte nicht angelegt werden.'
  if (/^failed to update record\.?$/i.test(t)) return 'Datensatz konnte nicht aktualisiert werden.'
  if (/^failed to delete record\.?$/i.test(t)) return 'Datensatz konnte nicht gelöscht werden.'
  return t
}

export function pocketBaseFullErrorMessage(e, context403Hint) {
  let base = pocketBaseErrorMessage(e)
  const details = pocketBaseValidationDetails(e)
  const resp = pocketBaseMergedResponse(e)
  const status = e?.status ?? resp?.status
  const genericPb =
    typeof base === 'string' &&
    /^Failed to (create|update|delete) record\.?$/i.test(base.trim())
  const genericOp = genericPb ? /^Failed to (create|update|delete) record\.?$/i.exec(base.trim()) : null
  const opVerb = genericOp ? String(genericOp[1] || '').toLowerCase() : ''
  if (genericPb) {
    base = pocketBaseGenericRecordMessageDe(base)
  }
  if (genericPb && !details && (status === 403 || status === 401)) {
    const regel =
      opVerb === 'update'
        ? '„Update“'
        : opVerb === 'delete'
          ? '„Delete“'
          : '„Create“'
    base = `${base.trim()} (Zugriff verweigert — API-Regel ${regel} / Rolle / Mandant tenant_id prüfen.)`
  } else if (genericPb && !details && status === 400) {
    const hint400 =
      opVerb === 'update'
        ? 'PocketBase liefert oft keine Feld-Details bei 400. Typisch: (1) Mandant tenant_id (Artikel ↔ Nutzer), (2) Relationen lager/unterlager, (3) Rolle users (Schreiben: admin/lagerleiter/inventur/users; nicht magazin_readonly). Netzwerk-Tab: PATCH-Antwort „data“; Admin → Collection artikel → Logs.'
        : opVerb === 'delete'
          ? 'API-Regel „Delete“, Mandant oder Abhängigkeiten (z. B. Relationen). Admin-Logs prüfen.'
          : 'API-Regel „Create“, Rolle, Mandant tenant_id, Lager/Unterlager. Admin-Logs prüfen.'
    base = `${base.trim()} (${hint400})`
  } else if (genericPb && !details && status >= 400) {
    base = `${base.trim()} (HTTP ${status}; keine Feld-Details von PocketBase — Admin-Logs prüfen.)`
  }
  let msg = details ? `${base} — ${details}` : base
  if ((status === 403 || status === 401) && context403Hint) {
    msg = `${msg} ${context403Hint}`
  }
  return msg
}
