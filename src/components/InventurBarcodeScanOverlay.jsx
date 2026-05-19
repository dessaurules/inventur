import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { normalizeScannedCode } from '../lib/barcodeSearchResolve.js'
import {
  barcodeCameraOverlay,
  barcodeCameraVideo,
  barcodeCameraWrap,
  barcodeDialogCloseBtn,
  barcodeDialogContent,
  barcodeDialogHeader,
  barcodeDialogOverlay,
  barcodeDialogTitle,
  barcodeFieldGroup,
  barcodeInput,
  barcodeLabel,
  barcodeStatusText,
} from '../lib/barcodeDialogUi.js'

/**
 * Kompaktes Scan-Overlay für die Inventur-Suche (Touch, ohne Enter).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(code: string) => void} props.onCodeScanned
 */
export function InventurBarcodeScanOverlay({ open, onOpenChange, onCodeScanned }) {
  const [manualCode, setManualCode] = useState('')
  const [scannerMessage, setScannerMessage] = useState('')
  const [scannerActive, setScannerActive] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const scanLockRef = useRef(false)
  const zxingControlsRef = useRef(null)

  const finish = useCallback(
    (raw) => {
      const code = normalizeScannedCode(raw)
      if (!code) return
      scanLockRef.current = true
      onCodeScanned(code)
      onOpenChange(false)
    },
    [onCodeScanned, onOpenChange]
  )

  const stopCamera = useCallback(() => {
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop()
      } catch {
        /* ignore */
      }
      zxingControlsRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const s = streamRef.current
    if (s) {
      s.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    const v = videoRef.current
    if (v) v.srcObject = null
    scanLockRef.current = false
    setScannerActive(false)
  }, [])

  const handleOpenChange = useCallback(
    (next) => {
      if (!next) {
        stopCamera()
        setManualCode('')
        setScannerMessage('')
      }
      onOpenChange(next)
    },
    [onOpenChange, stopCamera]
  )

  useEffect(() => {
    if (!open) {
      stopCamera()
      return
    }
    scanLockRef.current = false
    if (!window.isSecureContext) {
      setScannerMessage(
        'Kamera bei http:// oft blockiert. Barcode unten eintippen oder HTTPS nutzen.'
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Kein Kamera-Zugriff.')
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
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        if (nativeDetector) {
          video.srcObject = stream
          await video.play()
          setScannerActive(true)
          setScannerMessage('Barcode ins Bild halten.')

          const tick = async () => {
            if (cancelled || scanLockRef.current) return
            try {
              if (video.readyState >= 2) {
                const codes = await nativeDetector.detect(video)
                const raw = String(codes?.[0]?.rawValue ?? '').trim()
                if (raw) {
                  stopCamera()
                  finish(raw)
                  return
                }
              }
            } catch {
              /* ignore */
            }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
          return
        }

        setScannerMessage('Kamera aktiv. Barcode ins Bild halten.')
        setScannerActive(true)
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        let controls
        try {
          controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
            if (cancelled || scanLockRef.current) return
            const raw = result ? String(result.getText?.() ?? '').trim() : ''
            if (!raw) return
            try {
              ctrl.stop()
            } catch {
              /* ignore */
            }
            zxingControlsRef.current = null
            stopCamera()
            finish(raw)
          })
        } catch {
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
          setScannerActive(false)
          setScannerMessage('Kamera-Scan konnte nicht gestartet werden.')
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
        zxingControlsRef.current = controls
      } catch {
        setScannerMessage('Kamera nicht verfügbar (Berechtigung prüfen).')
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, finish, stopCamera])

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={barcodeDialogOverlay} />
        <Dialog.Content
          className={barcodeDialogContent}
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-label="Barcode scannen"
        >
          <Dialog.Close type="button" className={barcodeDialogCloseBtn} aria-label="Schließen">
            <X className="h-4 w-4" aria-hidden />
          </Dialog.Close>

          <div className={barcodeDialogHeader}>
            <Dialog.Title className={barcodeDialogTitle}>Barcode scannen</Dialog.Title>
          </div>

          <div className={barcodeCameraWrap}>
            <video ref={videoRef} className={barcodeCameraVideo} muted playsInline />
            {!scannerActive ? (
              <div className={barcodeCameraOverlay}>{scannerMessage || 'Kamera wird vorbereitet…'}</div>
            ) : null}
          </div>
          {scannerMessage && scannerActive ? (
            <p className={barcodeStatusText}>{scannerMessage}</p>
          ) : null}

          <div className={barcodeFieldGroup}>
            <label htmlFor="inventur-scan-manual" className={barcodeLabel}>
              Oder Barcode eingeben
            </label>
            <input
              id="inventur-scan-manual"
              type="text"
              inputMode="numeric"
              className={`${barcodeInput} inventur-scan-manual-input`}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="z. B. 4001234567890"
              autoComplete="off"
            />
          </div>

          <div className="inventur-scan-dialog-actions">
            <Dialog.Close type="button" className="inventur-scan-btn inventur-scan-btn--secondary">
              Abbrechen
            </Dialog.Close>
            <button
              type="button"
              className="inventur-scan-btn inventur-scan-btn--primary"
              disabled={!String(manualCode ?? '').trim()}
              onClick={() => finish(manualCode)}
            >
              Übernehmen
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
