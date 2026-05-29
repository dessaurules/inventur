import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { barcodesMatch, fetchOpenFoodFactsName } from '../lib/barcodes.js'
import {
  barcodeAlert,
  barcodeButtonOutline,
  barcodeButtonPrimary,
  barcodeCameraOverlay,
  barcodeCameraVideo,
  barcodeCameraWrap,
  barcodeCreateGrid,
  barcodeDialogCloseBtn,
  barcodeDialogContent,
  barcodeDialogHeader,
  barcodeDialogOverlay,
  barcodeDialogTitle,
  barcodeBarcodeActions,
  barcodeDialogActions,
  barcodeFieldGroup,
  barcodeInlineCode,
  barcodeInput,
  barcodeLabel,
  barcodeLinkEmpty,
  barcodeLinkItemCn,
  barcodeLinkItemMeta,
  barcodeLinkItemTitle,
  barcodeLinkList,
  barcodeLinkPreview,
  barcodeSectionActions,
  barcodeStatusText,
} from '../lib/barcodeDialogUi.js'

const EMPTY_CREATE_DRAFT = { preisInput: '', einheit: 'Stk', category: '' }

function BarcodeScanIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 20V10h10M56 20V10H46M8 44v10h10M56 44v10H46" />
      <path d="M16 18v28M21 18v28M26 18v28M31 18v28M35 18v28M40 18v28M45 18v28M50 18v28" />
      <path d="M14 32h36" />
    </svg>
  )
}

/**
 * Inventur: Artikel hinzufügen (Formular primär, Barcode-Scan optional eingeklappt).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {boolean} [props.initialExpandScan]
 * @param {Array<{ id: string, name?: string, artikelnummer?: string, barcode?: string, category?: string, archived?: boolean }>} props.items
 * @param {string[]} props.categories
 * @param {(hit: { id: string, name?: string, artikelnummer?: string }) => void} props.onArticleFound
 * @param {(payload: {
 *   code: string,
 *   name: string,
 *   preis: number,
 *   einheit: string,
 *   category: string,
 * }) => Promise<{ ok: boolean, message?: string }>} props.onCreateArticle
 * @param {(payload: { code: string, articleId: string }) => Promise<{ ok: boolean, message?: string }>} props.onLinkBarcode
 */
export function BarcodeScanDialog({
  open,
  onOpenChange,
  initialExpandScan = false,
  items,
  categories,
  onArticleFound,
  onCreateArticle,
  onLinkBarcode,
}) {
  const [scanExpanded, setScanExpanded] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [articleName, setArticleName] = useState('')
  const [barcodeLookupBusy, setBarcodeLookupBusy] = useState(false)
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState('')
  const [barcodeScannerMessage, setBarcodeScannerMessage] = useState('')
  const [barcodeScannerActive, setBarcodeScannerActive] = useState(false)
  const [barcodeCreateDraft, setBarcodeCreateDraft] = useState(EMPTY_CREATE_DRAFT)
  const [barcodeLinkMode, setBarcodeLinkMode] = useState(false)
  const [barcodeLinkSearch, setBarcodeLinkSearch] = useState('')
  const [barcodeLinkSelectedId, setBarcodeLinkSelectedId] = useState(null)

  const barcodeVideoRef = useRef(null)
  const barcodeStreamRef = useRef(null)
  const barcodeRafRef = useRef(0)
  const barcodeScanLockRef = useRef(false)
  const barcodeZxingControlsRef = useRef(null)
  const articleNameInputRef = useRef(null)
  const barcodeInputRef = useRef(null)

  const codeTrimmed = String(barcodeInput ?? '').trim()
  const hasKnownArticle = useMemo(
    () => Boolean(codeTrimmed) && items.some((it) => barcodesMatch(it.barcode, codeTrimmed)),
    [codeTrimmed, items]
  )
  const showUnknownBarcodeHint = Boolean(codeTrimmed) && !hasKnownArticle

  const barcodeLinkCandidates = useMemo(() => {
    const q = String(barcodeLinkSearch ?? '').trim().toLowerCase()
    return items
      .filter((it) => it && !it.archived)
      .filter((it) => {
        if (!q) return true
        const name = String(it.name ?? '').toLowerCase()
        const nr = String(it.artikelnummer ?? '').toLowerCase()
        const cat = String(it.category ?? '').toLowerCase()
        const bc = String(it.barcode ?? '').toLowerCase()
        return name.includes(q) || nr.includes(q) || cat.includes(q) || bc.includes(q)
      })
      .slice(0, 100)
  }, [items, barcodeLinkSearch])

  const resetDialogState = useCallback(() => {
    setScanExpanded(false)
    setBarcodeInput('')
    setArticleName('')
    setBarcodeLookupBusy(false)
    setBarcodeLookupMessage('')
    setBarcodeScannerMessage('')
    setBarcodeScannerActive(false)
    setBarcodeCreateDraft(EMPTY_CREATE_DRAFT)
    setBarcodeLinkMode(false)
    setBarcodeLinkSearch('')
    setBarcodeLinkSelectedId(null)
  }, [])

  const stopBarcodeCamera = useCallback(() => {
    if (barcodeZxingControlsRef.current) {
      try {
        barcodeZxingControlsRef.current.stop()
      } catch {
        /* ignore */
      }
      barcodeZxingControlsRef.current = null
    }
    if (barcodeRafRef.current) {
      cancelAnimationFrame(barcodeRafRef.current)
      barcodeRafRef.current = 0
    }
    const s = barcodeStreamRef.current
    if (s) {
      s.getTracks().forEach((t) => t.stop())
      barcodeStreamRef.current = null
    }
    const v = barcodeVideoRef.current
    if (v) v.srcObject = null
    barcodeScanLockRef.current = false
    setBarcodeScannerActive(false)
  }, [])

  const handleOpenChange = useCallback(
    (next) => {
      if (!next) {
        stopBarcodeCamera()
        resetDialogState()
      }
      onOpenChange(next)
    },
    [onOpenChange, resetDialogState, stopBarcodeCamera]
  )

  const resolveScannedBarcode = useCallback(
    (scannedCode) => {
      const code = String(scannedCode ?? barcodeInput ?? '').trim()
      if (!code) return
      const hit = items.find((it) => barcodesMatch(it.barcode, code))
      if (hit) {
        flushSync(() => {
          stopBarcodeCamera()
          resetDialogState()
          onOpenChange(false)
          onArticleFound(hit)
        })
        return
      }
      setBarcodeInput(code)
      setBarcodeLinkMode(false)
      setBarcodeLinkSearch('')
      setBarcodeLinkSelectedId(null)
      setBarcodeLookupBusy(true)
      setBarcodeLookupMessage('')
      void fetchOpenFoodFactsName(code)
        .then((name) => {
          if (name) setArticleName((prev) => prev || name)
          setBarcodeLookupMessage(
            name
              ? 'Kein Artikel in deinem Bestand. Name aus Open Food Facts wurde übernommen.'
              : 'Kein Artikel im Bestand gefunden. Bitte Name ergänzen.'
          )
        })
        .finally(() => {
          setBarcodeLookupBusy(false)
        })
    },
    [barcodeInput, items, onArticleFound, onOpenChange, resetDialogState, stopBarcodeCamera]
  )

  useEffect(() => {
    if (open) {
      setScanExpanded(Boolean(initialExpandScan))
    }
  }, [open, initialExpandScan])

  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.left = prev.bodyLeft
      body.style.right = prev.bodyRight
      body.style.width = prev.bodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      articleNameInputRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open || !scanExpanded) {
      stopBarcodeCamera()
      if (!scanExpanded) setBarcodeScannerMessage('')
      return
    }
    if (!window.isSecureContext) {
      setBarcodeScannerMessage(
        'Live-Kamera: Bei http:// im WLAN nicht möglich (Vorgabe des Browsers). ' +
          'Stattdessen Barcode tippen, oder lokal HTTPS (certs/, siehe Server-Konsole).'
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeScannerMessage('Kein Kamera-Zugriff verfügbar.')
      return
    }

    let cancelled = false
    let nativeDetector = null
    if (typeof window.BarcodeDetector === 'function') {
      try {
        nativeDetector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        })
      } catch {
        nativeDetector = null
      }
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        barcodeStreamRef.current = stream
        const video = barcodeVideoRef.current
        if (!video) return

        if (nativeDetector) {
          video.srcObject = stream
          await video.play()
          setBarcodeScannerActive(true)
          setBarcodeScannerMessage('Kamera aktiv. Barcode ins Bild halten.')

          const tick = async () => {
            if (cancelled) return
            try {
              if (video.readyState >= 2 && !barcodeScanLockRef.current) {
                const codes = await nativeDetector.detect(video)
                const raw = String(codes?.[0]?.rawValue ?? '').trim()
                if (raw) {
                  barcodeScanLockRef.current = true
                  stopBarcodeCamera()
                  resolveScannedBarcode(raw)
                  return
                }
              }
            } catch {
              /* ignore frame errors */
            }
            barcodeRafRef.current = requestAnimationFrame(tick)
          }
          barcodeRafRef.current = requestAnimationFrame(tick)
          return
        }

        setBarcodeScannerMessage('Kamera aktiv (Kompatibilitätsmodus). Barcode ins Bild halten.')
        setBarcodeScannerActive(true)
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        let controls
        try {
          controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
            if (cancelled || barcodeScanLockRef.current) return
            const raw = result ? String(result.getText?.() ?? '').trim() : ''
            if (!raw) return
            barcodeScanLockRef.current = true
            try {
              ctrl.stop()
            } catch {
              /* ignore */
            }
            barcodeZxingControlsRef.current = null
            stopBarcodeCamera()
            resolveScannedBarcode(raw)
          })
        } catch (e) {
          stream.getTracks().forEach((t) => t.stop())
          barcodeStreamRef.current = null
          setBarcodeScannerActive(false)
          setBarcodeScannerMessage('Kamera-Scan konnte nicht gestartet werden.')
          if (import.meta.env.DEV) console.error('[barcode zxing]', e)
          return
        }
        if (cancelled) {
          try {
            controls.stop()
          } catch {
            /* ignore */
          }
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        barcodeZxingControlsRef.current = controls
      } catch {
        setBarcodeScannerMessage('Kamera konnte nicht gestartet werden (Berechtigung prüfen).')
      }
    }

    void start()
    return () => {
      cancelled = true
      stopBarcodeCamera()
    }
  }, [open, scanExpanded, resolveScannedBarcode, stopBarcodeCamera])

  const toggleScan = () => {
    setScanExpanded((v) => {
      if (v) stopBarcodeCamera()
      return !v
    })
  }

  const handleCreate = async () => {
    const nm = String(articleName ?? '').trim()
    if (!nm) {
      setBarcodeLookupMessage('Bitte einen Artikelnamen eingeben.')
      return
    }
    const preisRaw = String(barcodeCreateDraft.preisInput ?? '')
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.')
    const preis = Number(preisRaw)
    if (!Number.isFinite(preis) || preis < 0) {
      setBarcodeLookupMessage('Bitte einen gültigen Preis eingeben (z. B. 0 oder 1,99).')
      return
    }
    const cat = String(barcodeCreateDraft.category ?? '').trim()
    const res = await onCreateArticle({
      code: codeTrimmed,
      name: nm,
      preis,
      einheit: String(barcodeCreateDraft.einheit ?? '').trim() || 'Stk',
      category: cat,
    })
    if (res.ok) {
      stopBarcodeCamera()
      resetDialogState()
      onOpenChange(false)
    } else if (res.message) {
      setBarcodeLookupMessage(res.message)
    }
  }

  const handleLink = async () => {
    if (!codeTrimmed) {
      setBarcodeLookupMessage('Bitte zuerst einen Barcode eingeben oder scannen.')
      return
    }
    const res = await onLinkBarcode({
      code: codeTrimmed,
      articleId: barcodeLinkSelectedId,
    })
    if (res.ok) {
      stopBarcodeCamera()
      resetDialogState()
      onOpenChange(false)
    } else if (res.message) {
      setBarcodeLookupMessage(res.message)
    }
  }

  const showCreateForm = !barcodeLinkMode

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={barcodeDialogOverlay} />
        <Dialog.Content
          className={barcodeDialogContent}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Close type="button" className={barcodeDialogCloseBtn} aria-label="Schließen">
            <X className="h-4 w-4" aria-hidden />
          </Dialog.Close>

          <div className={barcodeDialogHeader}>
            <Dialog.Title className={barcodeDialogTitle}>Artikel hinzufügen</Dialog.Title>
          </div>

          {scanExpanded ? (
            <>
              <div className={barcodeCameraWrap}>
                <video ref={barcodeVideoRef} className={barcodeCameraVideo} muted playsInline />
                {!barcodeScannerActive ? (
                  <div className={barcodeCameraOverlay}>
                    {barcodeScannerMessage || 'Kamera wird vorbereitet…'}
                  </div>
                ) : null}
              </div>
              {barcodeScannerMessage && barcodeScannerActive ? (
                <p className={barcodeStatusText}>{barcodeScannerMessage}</p>
              ) : null}
            </>
          ) : null}

          {showCreateForm ? (
            <div className="flex flex-col gap-4" role="region" aria-label="Neuer Artikel">
              {showUnknownBarcodeHint ? (
                <div className={barcodeAlert} role="status">
                  Kein Artikel mit Barcode{' '}
                  <strong className="font-semibold">{codeTrimmed}</strong> gefunden.
                </div>
              ) : null}

              <div className={barcodeFieldGroup}>
                <label htmlFor="add-article-name" className={barcodeLabel}>
                  Name *
                </label>
                <input
                  ref={articleNameInputRef}
                  id="add-article-name"
                  type="text"
                  className={barcodeInput}
                  value={articleName}
                  onChange={(e) => setArticleName(e.target.value)}
                  placeholder="Artikelname"
                  autoComplete="off"
                />
              </div>

              <div className={barcodeFieldGroup}>
                <span className={barcodeLabel}>Barcode (optional)</span>
                <div className="flex items-stretch gap-2">
                  <input
                    ref={barcodeInputRef}
                    id="add-article-barcode"
                    type="text"
                    inputMode="numeric"
                    className={`${barcodeInput} min-w-0 flex-1`}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Barcode"
                    autoComplete="off"
                  />
                  <div className={`${barcodeBarcodeActions} w-[8.75rem]`}>
                    <button
                      type="button"
                      className={`inventur-add-dialog-scan-toggle inventur-add-dialog-scan-toggle--row${scanExpanded ? ' inventur-add-dialog-scan-toggle--active' : ''}`}
                      onClick={toggleScan}
                      aria-label={scanExpanded ? 'Kamera schließen' : 'Barcode scannen'}
                      aria-pressed={scanExpanded}
                    >
                      <BarcodeScanIcon className="inventur-add-dialog-scan-icon" />
                    </button>
                    <button
                      type="button"
                      className={barcodeButtonOutline}
                      disabled={barcodeLookupBusy || !codeTrimmed}
                      onClick={() => resolveScannedBarcode(barcodeInput)}
                    >
                      {barcodeLookupBusy ? '…' : 'Prüfen'}
                    </button>
                  </div>
                </div>
              </div>

              <div className={barcodeCreateGrid}>
                <div className={barcodeFieldGroup}>
                  <label htmlFor="add-article-preis" className={barcodeLabel}>
                    Preis
                  </label>
                  <input
                    id="add-article-preis"
                    type="text"
                    inputMode="decimal"
                    className={barcodeInput}
                    value={barcodeCreateDraft.preisInput}
                    onChange={(e) =>
                      setBarcodeCreateDraft((prev) => ({ ...prev, preisInput: e.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
                <div className={barcodeFieldGroup}>
                  <label htmlFor="add-article-einheit" className={barcodeLabel}>
                    Einheit
                  </label>
                  <select
                    id="add-article-einheit"
                    className={barcodeInput}
                    value={barcodeCreateDraft.einheit}
                    onChange={(e) =>
                      setBarcodeCreateDraft((prev) => ({ ...prev, einheit: e.target.value }))
                    }
                  >
                    <option value="Stk">Stk</option>
                    <option value="l">l</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="Kiste">Kiste</option>
                    <option value="Flasche">Flasche</option>
                  </select>
                </div>
                <div className={barcodeFieldGroup}>
                  <label htmlFor="add-article-category" className={barcodeLabel}>
                    Kategorie
                  </label>
                  <select
                    id="add-article-category"
                    className={barcodeInput}
                    value={barcodeCreateDraft.category}
                    onChange={(e) =>
                      setBarcodeCreateDraft((prev) => ({ ...prev, category: e.target.value }))
                    }
                  >
                    <option value="">— Keine —</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showUnknownBarcodeHint ? (
                <button
                  type="button"
                  className={barcodeButtonOutline}
                  onClick={() => {
                    setBarcodeLinkMode(true)
                    setBarcodeLinkSearch('')
                    setBarcodeLinkSelectedId(null)
                  }}
                >
                  Bestehendem Artikel zuordnen…
                </button>
              ) : null}

              <div className={barcodeDialogActions}>
                <Dialog.Close type="button" className={barcodeButtonOutline}>
                  Schließen
                </Dialog.Close>
                <button
                  type="button"
                  className={barcodeButtonPrimary}
                  disabled={barcodeLookupBusy}
                  onClick={() => void handleCreate()}
                >
                  Artikel anlegen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4" role="region" aria-label="Barcode zuordnen">
              <p className="text-sm text-muted-foreground">
                Barcode <strong className="font-medium text-foreground">{codeTrimmed}</strong> einem
                Artikel zuordnen.
              </p>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  className={`${barcodeInput} pl-9`}
                  value={barcodeLinkSearch}
                  onChange={(e) => setBarcodeLinkSearch(e.target.value)}
                  placeholder="Suche: Name, Artikelnr., Kategorie …"
                  autoComplete="off"
                />
              </div>
              <ul className={barcodeLinkList} role="listbox" aria-label="Artikel wählen">
                {barcodeLinkCandidates.length === 0 ? (
                  <li className={barcodeLinkEmpty}>Keine Treffer.</li>
                ) : (
                  barcodeLinkCandidates.map((it) => {
                    const selected = barcodeLinkSelectedId === it.id
                    return (
                      <li key={it.id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={barcodeLinkItemCn(selected)}
                          onClick={() => setBarcodeLinkSelectedId(it.id)}
                        >
                          <span className={barcodeLinkItemTitle}>{it.name || '—'}</span>
                          <span className={barcodeLinkItemMeta}>
                            {it.artikelnummer ? `Nr. ${it.artikelnummer}` : 'Ohne Artikelnr.'}
                            {it.category ? ` · ${it.category}` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
              {barcodeLinkSelectedId ? (
                <p className={barcodeLinkPreview}>
                  Auswahl:{' '}
                  <strong className="font-medium text-foreground">
                    {items.find((x) => x.id === barcodeLinkSelectedId)?.name || '—'}
                  </strong>
                </p>
              ) : null}
              <div className={barcodeSectionActions}>
                <button
                  type="button"
                  className={barcodeButtonOutline}
                  onClick={() => setBarcodeLinkMode(false)}
                >
                  Zurück
                </button>
                <button type="button" className={barcodeButtonPrimary} onClick={() => void handleLink()}>
                  Barcode zuordnen
                </button>
              </div>
            </div>
          )}

          {barcodeLookupMessage ? (
            <p className="text-sm text-muted-foreground" role="status">
              {barcodeLookupMessage}
            </p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
