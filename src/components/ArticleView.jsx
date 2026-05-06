import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { pb } from '../lib/pocketbase'
import { rowKeyForItem } from '../lib/articleRowKey'
import { PB_COLLECTIONS } from '../lib/pocketbaseCollections'
import { buildSessionPositionen } from '../lib/sessionSnapshot'
import { pocketBaseErrorMessage } from '../lib/pocketBaseErrorMessage'
import {
  fetchZaehlungQuantitiesByRowKey,
  upsertZaehlungAggregateTotal,
  upsertZaehlungPosition,
} from '../lib/zaehlungPosition'

function qtyStorageKey(sessionId, scopeSuffix) {
  const s = scopeSuffix ? `:${scopeSuffix}` : ''
  return `vibe-inventur-qty-${sessionId}${s}`
}

function loadQtyFromStorage(sessionId, scopeSuffix) {
  if (!sessionId) return {}
  try {
    const raw = sessionStorage.getItem(qtyStorageKey(sessionId, scopeSuffix))
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function formatQuantityDisplay(value) {
  const n = Math.max(0, Number(value) || 0)
  if (n === 0) return '0'
  const rounded = Math.round(n * 100) / 100
  const s = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
  return s.replace('.', ',')
}

function parseQtyInput(raw) {
  const t = String(raw ?? '')
    .trim()
    .replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

const ArticleView = forwardRef(function ArticleView(
  {
    items,
    selectedCategory,
    searchQuery = '',
    activeZaehlSessionId,
    onSyncError,
    emptyCatalogHint,
    countingApp = false,
    zaehlScopeKey = '',
    scrollFocusArticleId = null,
    onScrollFocusArticleIdHandled,
  },
  ref
) {
  const scopeForPb = countingApp ? String(zaehlScopeKey ?? '').trim() : ''
  const aggregateAlleLager = Boolean(countingApp && activeZaehlSessionId && !scopeForPb)
  const storageScope =
    countingApp && activeZaehlSessionId ? scopeForPb || '__all__' : ''
  const [quantities, setQuantities] = useState(() =>
    loadQtyFromStorage(activeZaehlSessionId, storageScope)
  )
  const [customAddByRow, setCustomAddByRow] = useState({})
  const itemIdsKey = items.map((i) => i.id).join('|')
  const itemsRef = useRef(items)
  itemsRef.current = items
  /** rowKeys, für die gerade ein PB-Upsert läuft – Server-Merge überschreibt diese nicht. */
  const pendingSyncRef = useRef(new Set())
  /** Nach bewusstem Auf 0: kurz kein positives `m` vom Server übernehmen (Poll vor fertigem Delete/Update). */
  const softZeroUntilRef = useRef(new Map())

  const fullQuantities = useMemo(() => {
    const out = { ...quantities }
    items.forEach((item, index) => {
      const rowKey = rowKeyForItem(item, index)
      if (out[rowKey] === undefined) out[rowKey] = 0
    })
    return out
  }, [quantities, items])

  const scrollHandledRef = useRef(onScrollFocusArticleIdHandled)
  scrollHandledRef.current = onScrollFocusArticleIdHandled

  useImperativeHandle(
    ref,
    () => ({
      getPositionenForClose(itemsList) {
        return buildSessionPositionen(itemsList, fullQuantities)
      },
    }),
    [fullQuantities]
  )

  useEffect(() => {
    if (!activeZaehlSessionId) return
    try {
      sessionStorage.setItem(
        qtyStorageKey(activeZaehlSessionId, storageScope),
        JSON.stringify(fullQuantities)
      )
    } catch {
      /* ignore */
    }
  }, [fullQuantities, activeZaehlSessionId, storageScope])

  useEffect(() => {
    if (!activeZaehlSessionId || items.length === 0) return

    const mergeFromServer = (fromPb) => {
      setQuantities((prev) => {
        const next = { ...prev }
        for (const [rk, m] of Object.entries(fromPb)) {
          if (pendingSyncRef.current.has(rk)) continue
          const until = softZeroUntilRef.current.get(rk)
          const prevM = prev[rk] ?? 0
          if (until != null && Date.now() < until && prevM === 0 && m > 0) {
            continue
          }
          next[rk] = m
          if (m === 0) softZeroUntilRef.current.delete(rk)
        }
        return next
      })
    }

    let cancelled = false
    let removeSub = null

    const fetchScopeArg = aggregateAlleLager ? '' : scopeForPb

    const pull = async () => {
      try {
        const map = await fetchZaehlungQuantitiesByRowKey(
          pb,
          activeZaehlSessionId,
          itemsRef.current,
          fetchScopeArg
        )
        if (cancelled) return
        mergeFromServer(map)
      } catch {
        /* Regeln / Netzwerk */
      }
    }

    pull()
    const intervalId = window.setInterval(pull, 4000)

    ;(async () => {
      try {
        removeSub = await pb.collection(PB_COLLECTIONS.zaehlungAktuell).subscribe(
          '*',
          (e) => {
            const rec = e.record
            const sid = typeof rec.session === 'string' ? rec.session : rec.session?.id
            if (sid !== activeZaehlSessionId) return

            if (aggregateAlleLager) {
              void pull()
              return
            }

            const recScope = String(rec.zaehl_scope ?? '').trim()
            if (recScope !== scopeForPb) return

            const aid = typeof rec.artikel === 'string' ? rec.artikel : rec.artikel?.id
            if (!aid) return
            const list = itemsRef.current
            const idx = list.findIndex((it) => String(it.id) === String(aid))
            if (idx < 0) return
            const rk = rowKeyForItem(list[idx], idx)

            if (e.action === 'delete') {
              if (pendingSyncRef.current.has(rk)) return
              setQuantities((prev) => {
                if (pendingSyncRef.current.has(rk)) return prev
                return { ...prev, [rk]: 0 }
              })
              return
            }

            const m = Math.round((Number(rec.menge) || 0) * 100) / 100
            if (pendingSyncRef.current.has(rk)) return
            setQuantities((prev) => {
              const until = softZeroUntilRef.current.get(rk)
              const prevM = prev[rk] ?? 0
              if (until != null && Date.now() < until && prevM === 0 && m > 0) return prev
              if (m === 0) softZeroUntilRef.current.delete(rk)
              return { ...prev, [rk]: m }
            })
          },
          { filter: `session = "${activeZaehlSessionId}"` }
        )
      } catch {
        /* z. B. kein WebSocket hinter dem HTTP-Proxy – Polling reicht */
      }
    })()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      if (typeof removeSub === 'function') {
        Promise.resolve(removeSub()).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsRef + itemIdsKey
  }, [activeZaehlSessionId, itemIdsKey, aggregateAlleLager, scopeForPb])

  const pushQtyToServer = (rowKey, nextVal, item) => {
    const aid = item?.id
    if (!aid || String(aid).startsWith('local-')) return
    pendingSyncRef.current.add(rowKey)
    if (nextVal === 0) {
      softZeroUntilRef.current.set(rowKey, Date.now() + 1500)
    }
    const sync = aggregateAlleLager
      ? upsertZaehlungAggregateTotal(pb, activeZaehlSessionId, aid, nextVal)
      : upsertZaehlungPosition(pb, activeZaehlSessionId, aid, nextVal, scopeForPb)
    sync
      .then(() => {
        onSyncError?.('')
      })
      .catch((err) => {
        onSyncError?.(pocketBaseErrorMessage(err))
        softZeroUntilRef.current.delete(rowKey)
      })
      .finally(() => {
        window.setTimeout(() => {
          pendingSyncRef.current.delete(rowKey)
        }, 320)
      })
  }

  const addQty = (rowKey, delta, item) => {
    if (!activeZaehlSessionId) return
    /** Aktuelle Anzeige-Menge (fullQuantities je Render) – nicht aus einem verzögerten setState-Updater lesen. */
    const cur = fullQuantities[rowKey] ?? 0
    const nextVal = Math.max(0, Math.round((cur + delta) * 100) / 100)
    setQuantities((prev) => ({ ...prev, [rowKey]: nextVal }))
    pushQtyToServer(rowKey, nextVal, item)
  }

  const applyCustomAdd = (rowKey, item) => {
    const raw = customAddByRow[rowKey] ?? ''
    const value = parseQtyInput(raw)
    if (!Number.isFinite(value)) return
    if (value === 0) {
      setQuantities((prev) => ({ ...prev, [rowKey]: 0 }))
      pushQtyToServer(rowKey, 0, item)
    } else {
      addQty(rowKey, value, item)
    }
    setCustomAddByRow((prev) => ({ ...prev, [rowKey]: '' }))
  }

  const filteredByCategory =
    selectedCategory === 'Alle'
      ? items
      : items.filter((item) => item.category === selectedCategory)

  const searchNorm = String(searchQuery ?? '').trim().toLowerCase()
  const filteredItems = searchNorm
    ? filteredByCategory.filter((item) => {
        const name = String(item.name ?? '').toLowerCase()
        const nr = String(item.artikelnummer ?? '').toLowerCase()
        const cat = String(item.category ?? '').toLowerCase()
        const bc = String(item.barcode ?? '').toLowerCase()
        return (
          name.includes(searchNorm) ||
          nr.includes(searchNorm) ||
          cat.includes(searchNorm) ||
          bc.includes(searchNorm)
        )
      })
    : filteredByCategory

  useEffect(() => {
    if (!scrollFocusArticleId) return
    const sid = String(scrollFocusArticleId)
    let cancelled = false
    let attempts = 0
    const maxAttempts = 12
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(`[data-article-id="${CSS.escape(sid)}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        scrollHandledRef.current?.()
        return
      }
      attempts += 1
      if (attempts < maxAttempts) requestAnimationFrame(tick)
      else scrollHandledRef.current?.()
    }
    requestAnimationFrame(tick)
    return () => {
      cancelled = true
    }
  }, [scrollFocusArticleId, itemIdsKey, searchNorm, selectedCategory])

  const canCount = Boolean(activeZaehlSessionId)
  const onlyLocalArtikel =
    canCount &&
    items.length > 0 &&
    items.every((it) => !it.id || String(it.id).startsWith('local-'))

  return (
    <div className="article-view">
      {onlyLocalArtikel ? (
        <p className="session-message session-message--info" role="status">
          Nur Artikel aus PocketBase werden in „zaehlung_aktuell“ gespeichert. Im Magazin angelegte
          Einträge (ohne PB-Datensatz) erscheinen dort nicht.
        </p>
      ) : null}
      <div className="article-list">
        {filteredItems.length === 0 ? (
          <p className="empty-state">
            {items.length === 0 && emptyCatalogHint
              ? emptyCatalogHint
              : 'Keine Artikel in dieser Kategorie'}
          </p>
        ) : (
          filteredItems.map((item, index) => {
            const globalIndex = items.indexOf(item)
            const stableIndex = globalIndex >= 0 ? globalIndex : index
            const itemId = item.id || `${item.name}-${index}`
            const rowKey = rowKeyForItem(item, stableIndex)
            const formattedPrice = `${item.preis?.toFixed?.(2)?.replace('.', ',') ?? '0,00'} €`
            const einheit = String(item.einheit ?? '').trim() || 'Stk'
            const priceLabel = `${formattedPrice} · ${einheit}`
            const qty = canCount ? fullQuantities[rowKey] ?? 0 : 0
            const countLabel = formatQuantityDisplay(qty)
            return (
              <div key={itemId} className="article-box" data-article-id={itemId}>
                <div className="article-main">
                  <div className="article-title-line">
                    <div className="article-title-main">
                      <h3
                        className="article-name"
                        /* WebKit (Safari, Chrome iOS): sonst werden Ortsnamen im Artikeltext als Karten-Link erkannt */
                        x-apple-data-detectors="false"
                      >
                        <span className="article-name-text">{item.name}</span>
                      </h3>
                      <span className="article-title-price" aria-label={`Preis ${priceLabel}`}>
                        {priceLabel}
                      </span>
                    </div>
                    <span className="article-count" aria-label={`Anzahl ${countLabel}`}>
                      {countLabel}
                    </span>
                  </div>
                  <div className="article-actions-row">
                    <div className="article-count-buttons" role="group" aria-label="Menge anpassen">
                      <button
                        type="button"
                        className="article-qty-btn"
                        disabled={!canCount}
                        onClick={() => addQty(rowKey, -1, item)}
                        aria-label="Menge um 1 verringern"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="article-qty-btn"
                        disabled={!canCount}
                        onClick={() => addQty(rowKey, 1, item)}
                      >
                        1
                      </button>
                      <button
                        type="button"
                        className="article-qty-btn"
                        disabled={!canCount}
                        onClick={() => addQty(rowKey, 0.5, item)}
                      >
                        .5
                      </button>
                      <button
                        type="button"
                        className="article-qty-btn"
                        disabled={!canCount}
                        onClick={() => addQty(rowKey, 0.25, item)}
                      >
                        .25
                      </button>
                      <form
                        className="article-custom-add-form"
                        onSubmit={(e) => {
                          e.preventDefault()
                          applyCustomAdd(rowKey, item)
                        }}
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          className="article-custom-add-input"
                          value={customAddByRow[rowKey] ?? ''}
                          onChange={(e) =>
                            setCustomAddByRow((prev) => ({
                              ...prev,
                              [rowKey]: e.target.value,
                            }))
                          }
                          placeholder="0"
                          aria-label="Menge eingeben: Zahl addieren, 0 setzt zurück auf 0"
                          disabled={!canCount}
                        />
                        <button
                          type="submit"
                          className="article-qty-btn article-qty-btn--ok"
                          disabled={!canCount}
                          aria-label="Eingegebene Menge addieren (0 löscht die Zählung)"
                        >
                          OK
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

ArticleView.displayName = 'ArticleView'

export default ArticleView
