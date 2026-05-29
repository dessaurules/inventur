import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { cn } from '../../lib/cn.js'
import { formatPreisEUR, parsePreisInput, preisToInputString } from './format.js'
import { normalizeStueckProLiefergebinde } from './types.js'

const EINHEITEN_FALLBACK = ['Stk', 'l', 'kg', 'g', 'Kiste', 'Flasche', 'Glas']

function initialFromArtikel(artikel) {
  if (!artikel) {
    return {
      name: '',
      preisStr: '',
      einheit: 'Stk',
      stueckProLiefStr: '1',
      artikelnummer: '',
      kategorieId: '',
      lagerId: '',
    }
  }
  const st = normalizeStueckProLiefergebinde(artikel.stueckProLiefergebinde ?? 1)
  const nr =
    String(artikel.artikelnummer ?? '').trim() || String(artikel.lieferantenArtnr ?? '').trim()
  return {
    name: artikel.name,
    preisStr: artikel.id === '__new__' ? '' : preisToInputString(artikel.preis),
    einheit: artikel.einheit || 'Stk',
    stueckProLiefStr: String(st),
    artikelnummer: nr,
    kategorieId: artikel.kategorieId || '',
    lagerId: artikel.lagerId || '',
  }
}

/**
 * @param {object} props
 * @param {import('./types.js').MagazinArtikel | null} props.artikel
 * @param {boolean} props.readOnly
 * @param {string[]} props.kategorieNames
 * @param {Array<{id:string,name:string}>} [props.lagerList]
 * @param {(patch: object) => Promise<{ ok: boolean, message?: string, id?: string }>} props.onPatch
 * @param {(fields: object) => Promise<{ ok: boolean, message?: string, id?: string }>} [props.onCreate]
 * @param {(status: 'idle' | 'saving' | 'error') => void} props.onSaveStatus
 * @param {(msg: string) => void} [props.onErrorToast]
 * @param {(id: string) => void} [props.onCreated]
 * @param {(canSubmit: boolean) => void} [props.onDraftValidityChange]
 */
export const DetailDrawerForm = forwardRef(function DetailDrawerForm(
  {
    artikel,
    readOnly,
    kategorieNames,
    lagerList = [],
    onPatch,
    onCreate,
    onSaveStatus,
    onErrorToast,
    onCreated,
    onDraftValidityChange,
  },
  ref
) {
  const createDoneRef = useRef(false)
  const init = initialFromArtikel(artikel)
  const [name, setName] = useState(init.name)
  const [preisStr, setPreisStr] = useState(init.preisStr)
  const [einheit, setEinheit] = useState(init.einheit)
  const [stueckProLiefStr, setStueckProLiefStr] = useState(init.stueckProLiefStr)
  const [artikelnummer, setArtikelnummer] = useState(init.artikelnummer)
  const [kategorieId, setKategorieId] = useState(init.kategorieId)
  const [lagerId, setLagerId] = useState(init.lagerId)

  const isDraft = artikel?.id === '__new__'

  useEffect(() => {
    createDoneRef.current = false
  }, [artikel?.id])

  useEffect(() => {
    if (!isDraft || !onDraftValidityChange) return
    const preis = parsePreisInput(preisStr)
    const ok =
      Boolean(String(name ?? '').trim() && String(kategorieId ?? '').trim()) &&
      Number.isFinite(preis) &&
      preis >= 0
    onDraftValidityChange(ok)
  }, [name, kategorieId, preisStr, isDraft, onDraftValidityChange])

  const einheitOptions = [...new Set([...EINHEITEN_FALLBACK, einheit].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'de', { sensitivity: 'base' })
  )

  const flushSave = useCallback(async () => {
    if (!artikel || readOnly) return
    const preis = parsePreisInput(preisStr)
    if (!Number.isFinite(preis) || preis < 0) {
      onSaveStatus('error')
      onErrorToast?.('Preis ungültig.')
      return
    }
    const nm = String(name ?? '').trim()
    if (!nm) {
      onSaveStatus('error')
      onErrorToast?.('Name ist ein Pflichtfeld.')
      return
    }
    const isNew = artikel.id === '__new__'
    const nr = String(artikelnummer ?? '').trim()
    if (!isNew && !nr) {
      onSaveStatus('error')
      onErrorToast?.('Artikelnummer fehlt.')
      return
    }
    if (isNew && !String(kategorieId ?? '').trim()) {
      onSaveStatus('error')
      onErrorToast?.('Kategorie ist beim Anlegen ein Pflichtfeld.')
      return
    }
    onSaveStatus('saving')
    try {
      if (isNew && onCreate) {
        if (createDoneRef.current) {
          onSaveStatus('idle')
          return
        }
        const res = await onCreate({
          artikelnummer: nr,
          name: nm,
          preis,
          einheit: String(einheit || '').trim() || 'Stk',
          category: String(kategorieId || '').trim(),
          lagerId: String(lagerId || '').trim(),
          stueckProLiefergebinde: normalizeStueckProLiefergebinde(stueckProLiefStr),
          lieferantenArtnr: nr,
        })
        if (!res?.ok) {
          onSaveStatus('error')
          onErrorToast?.(res?.message || 'Anlegen fehlgeschlagen.')
          return
        }
        createDoneRef.current = true
        if (res.id) onCreated?.(res.id)
        onSaveStatus('idle')
        return
      }
      const res = await onPatch({
        id: artikel.id,
        artikelnummer: nr,
        name: nm,
        preis,
        einheit: String(einheit || '').trim() || 'Stk',
        category: String(kategorieId || '').trim(),
        lagerId: String(lagerId || '').trim(),
        stueckProLiefergebinde: normalizeStueckProLiefergebinde(stueckProLiefStr),
        lieferantenArtnr: nr,
      })
      if (!res?.ok) {
        onSaveStatus('error')
        onErrorToast?.(res?.message || 'Speichern fehlgeschlagen.')
        return
      }
      onSaveStatus('idle')
    } catch (err) {
      onSaveStatus('error')
      onErrorToast?.(err?.message || 'Speichern fehlgeschlagen.')
    }
  }, [
    artikel,
    readOnly,
    preisStr,
    name,
    einheit,
    stueckProLiefStr,
    artikelnummer,
    kategorieId,
    lagerId,
    onPatch,
    onCreate,
    onSaveStatus,
    onErrorToast,
    onCreated,
  ])

  useImperativeHandle(
    ref,
    () => ({
      /** Nur Footer „Speichern“ / „Anlegen“ — kein Auto-Save bei Eingabe. */
      save: () => flushSave(),
    }),
    [flushSave]
  )

  if (!artikel) {
    return (
      <p className="text-[12.5px] text-muted-foreground px-1">
        Wähle eine Zeile oder lege mit <kbd className="rounded border border-border px-1">n</kbd> einen
        neuen Artikel an.
      </p>
    )
  }

  const inputCls = cn(
    'h-8 w-full rounded-md border border-input bg-background px-2.5 text-[12.5px] text-foreground',
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  )
  const selectCls = cn(
    'h-8 w-full rounded-md border border-input bg-background px-2.5 text-[12.5px] text-foreground',
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  )
  const labelCls = 'text-[11px] font-medium text-muted-foreground'

  return (
    <form
      className="flex flex-col gap-2 px-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (!readOnly) void flushSave()
      }}
    >
      {/* Versteckter Submit-Button — ermöglicht Enter-Taste in jedem Textfeld */}
      <button type="submit" className="sr-only" aria-hidden tabIndex={-1} disabled={readOnly} />
      <label className="flex flex-col gap-0.5">
        <span className={labelCls}>Name</span>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          aria-label="Name"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className={labelCls}>Preis</span>
          <div className="relative">
            <input
              className={cn(inputCls, 'pr-6 text-right tabular-nums')}
              inputMode="decimal"
              value={preisStr}
              onChange={(e) => setPreisStr(e.target.value)}
              disabled={readOnly}
              aria-label="Preis"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              €
            </span>
          </div>
        </label>
        <label className="flex w-24 flex-col gap-0.5">
          <span className={labelCls}>Stk/Gebinde</span>
          <input
            className={cn(inputCls, 'text-right tabular-nums')}
            inputMode="numeric"
            value={stueckProLiefStr}
            onChange={(e) => setStueckProLiefStr(e.target.value)}
            disabled={readOnly}
            aria-label="Stück pro Liefergebinde"
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className={labelCls}>Artikelnummer</span>
        <input
          className={cn(inputCls, 'font-mono tabular-nums')}
          value={artikelnummer}
          onChange={(e) => setArtikelnummer(e.target.value)}
          disabled={readOnly}
          maxLength={100}
          placeholder={isDraft ? 'Leer = automatisch (z. B. I-00042)' : 'z. B. I-52280'}
          aria-label="Artikelnummer"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className={labelCls}>Einheit</span>
          <select
            className={selectCls}
            value={einheit}
            onChange={(e) => setEinheit(e.target.value)}
            disabled={readOnly}
            aria-label="Einheit"
          >
            {einheitOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        {lagerList.length > 1 && (
          <label className="flex flex-1 flex-col gap-0.5">
            <span className={labelCls}>Lager</span>
            <select
              className={selectCls}
              value={lagerId}
              onChange={(e) => setLagerId(e.target.value)}
              disabled={readOnly}
              aria-label="Lager"
            >
              <option value="">— Kein Lager —</option>
              {lagerList.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="flex flex-col gap-0.5">
        <span className={labelCls}>Kategorie</span>
        <select
          className={selectCls}
          value={kategorieId}
          onChange={(e) => setKategorieId(e.target.value)}
          disabled={readOnly}
          aria-label="Kategorie"
        >
          <option value="">— Keine —</option>
          {kategorieNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </form>
  )

})
