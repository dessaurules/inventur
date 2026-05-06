import { useEffect, useMemo, useState } from 'react'
import { pb } from '../../lib/pocketbase.js'
import { PB_COLLECTIONS } from '../../lib/pocketbaseCollections.js'
import { Preisverlauf } from '../../components/Preisverlauf.jsx'

function userLabelFromExpand(expanded) {
  if (!expanded || typeof expanded !== 'object') return ''
  const fn = String(expanded.firstName ?? '').trim()
  const ln = String(expanded.lastName ?? '').trim()
  const full = [fn, ln].filter(Boolean).join(' ')
  if (full) return full
  return String(expanded.email ?? '').trim()
}

function formatDt(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

/** Echter Wechsel alt→neu? null/leer und auf Cent gerundet 0 = kein Vorgänger (PB-Default/Float-Rauschen). */
function hatVorgaengerpreis(vorRaw) {
  if (vorRaw == null || vorRaw === '') return false
  const v = Number(vorRaw)
  if (!Number.isFinite(v)) return false
  if (Math.round(v * 100) === 0) return false
  return true
}

function rowLabel(r) {
  const hasVor = hatVorgaengerpreis(r.preis_vorher)
  const von = userLabelFromExpand(r.expand?.geaendert_von)
  const basis = hasVor ? 'Preisänderung' : 'Erster Preis'
  return von ? `${basis} · ${von}` : basis
}

/** @param {import('pocketbase').RecordModel} r */
function rowToPreisEintrag(r) {
  return {
    date: formatDt(r.created),
    price: Number(r.preis_nachher),
    label: rowLabel(r),
    timestamp: new Date(r.created).getTime(),
  }
}

/** Zwei Punkte pro Änderungszeile (vorher → nachher), damit die Sparkline schon nach einer Speicherung sichtbar ist. */
function rowsToChartEintraege(rows) {
  const out = []
  for (const r of rows) {
    const createdMs = new Date(r.created).getTime()
    if (Number.isNaN(createdMs)) continue
    const nach = Number(r.preis_nachher)
    if (!Number.isFinite(nach)) continue
    const vorRaw = r.preis_vorher
    if (hatVorgaengerpreis(vorRaw)) {
      const vor = Number(vorRaw)
      if (Number.isFinite(vor) && Math.abs(vor - nach) >= 0.01) {
        out.push({
          date: formatDt(new Date(createdMs - 1)),
          price: vor,
          label: 'Stand vorher',
          timestamp: createdMs - 1,
        })
      }
    }
    out.push({
      date: formatDt(r.created),
      price: nach,
      label: rowLabel(r),
      timestamp: createdMs,
    })
  }
  out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  return out
}

/**
 * Preisverlauf aus PocketBase (Hooks schreiben `artikel_preis_historie`).
 * @param {{ artikelId: string | null | undefined, reloadKey?: string | number }} props
 */
export function ArtikelPreisHistorie({ artikelId, reloadKey = 0 }) {
  const [rows, setRows] = useState(/** @type {import('pocketbase').RecordModel[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!artikelId || artikelId === '__new__') {
      setRows([])
      setLoading(false)
      setErr('')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await pb.collection(PB_COLLECTIONS.artikelPreisHistorie).getList(1, 250, {
          filter: `artikel = "${artikelId}"`,
          sort: 'created',
          expand: 'geaendert_von',
        })
        if (!cancelled) setRows(res.items)
      } catch (e) {
        const msg = e?.message || String(e)
        if (!cancelled) {
          if (/not found|couldn't find|404/i.test(msg)) {
            setErr('Preisverlauf: Collection fehlt oder PocketBase nicht migriert.')
          } else {
            setErr(msg)
          }
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [artikelId, reloadKey])

  const listData = useMemo(() => rows.map(rowToPreisEintrag), [rows])
  const chartData = useMemo(() => rowsToChartEintraege(rows), [rows])

  if (!artikelId || artikelId === '__new__') {
    return (
      <p className="text-[12px] italic text-muted-foreground">
        Preisverlauf ist nach dem ersten Speichern sichtbar.
      </p>
    )
  }

  if (loading) {
    return <p className="text-[12px] text-muted-foreground">Preisverlauf wird geladen…</p>
  }

  if (err) {
    return <p className="text-[12px] text-destructive/90">{err}</p>
  }

  return <Preisverlauf chartData={chartData} listData={listData} />
}
