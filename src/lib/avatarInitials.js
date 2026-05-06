/** Erster Buchstabe Vor- + Nachname (de-DE), sonst E-Mail-Localteil, sonst „?“. */
export function avatarInitials(firstName, lastName, emailFallback = '') {
  const f = String(firstName ?? '').trim()
  const l = String(lastName ?? '').trim()
  const a = f.charAt(0).toLocaleUpperCase('de-DE')
  const b = l.charAt(0).toLocaleUpperCase('de-DE')
  if (a && b) return `${a}${b}`
  if (a) return a
  if (b) return b
  const local = String(emailFallback ?? '').split('@')[0]?.trim() ?? ''
  const c = local.charAt(0).toLocaleUpperCase('de-DE')
  return c || '?'
}
