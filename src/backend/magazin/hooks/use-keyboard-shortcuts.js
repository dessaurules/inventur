import { useEffect, useRef } from 'react'

/** @param {EventTarget|null} target */
export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false
  const el = target
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.closest('[role="combobox"]')) return true
  return Boolean(el.closest('[data-magazin-command-input]'))
}

/**
 * @param {(e: KeyboardEvent) => void} onKeyDown
 */
export function useKeyboardShortcuts(onKeyDown) {
  const cbRef = useRef(onKeyDown)
  useEffect(() => {
    cbRef.current = onKeyDown
  }, [onKeyDown])
  useEffect(() => {
    const fn = (e) => cbRef.current(e)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])
}
