export function formatPreisEUR(preis) {
  const n = typeof preis === 'number' && Number.isFinite(preis) ? preis : 0
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function parsePreisInput(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

export function preisToInputString(preis) {
  if (typeof preis !== 'number' || !Number.isFinite(preis)) return ''
  return preis.toFixed(2).replace('.', ',')
}
