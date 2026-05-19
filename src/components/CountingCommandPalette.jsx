import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Barcode,
  ClipboardList,
  LogOut,
  Play,
  Search,
  Square,
  User,
  UserPlus,
} from 'lucide-react'
import { loadInventurSessionLists } from '../lib/inventurHistory.js'
import { formatUnterlagerLabel } from '../lib/lagerAccess.js'

function ownerLabel(rec) {
  const ex = rec?.expand?.session_owner
  if (!ex) return ''
  const fn = String(ex.first_name ?? '').trim()
  const ln = String(ex.last_name ?? '').trim()
  const name = [fn, ln].filter(Boolean).join(' ')
  return name || String(ex.email ?? '').trim() || ''
}

function sessionSubtitle(rec) {
  const owner = ownerLabel(rec)
  const lager = rec?.expand?.unterlager
    ? formatUnterlagerLabel(rec.expand.unterlager)
    : 'Alle Lager'
  return [owner, lager].filter(Boolean).join(' · ')
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {'dashboard' | 'session' | 'account'} props.context
 * @param {boolean} props.sessionBusy
 * @param {boolean} props.canEndSession
 * @param {object[]} props.items
 * @param {string[]} props.categories
 * @param {string} props.selectedCategory
 * @param {() => void} props.onStartSession
 * @param {() => void} props.onEndSession
 * @param {(id: string) => void} props.onJoinSession
 * @param {() => void} props.onOpenBarcode
 * @param {() => void} props.onFocusSearch
 * @param {(category: string) => void} props.onSelectCategory
 * @param {(item: object) => void} props.onSelectArticle
 * @param {() => void} props.onGoInventur
 * @param {() => void} props.onGoAccount
 * @param {() => void} props.onLogout
 */
export function CountingCommandPalette({
  open,
  onOpenChange,
  context,
  sessionBusy,
  canEndSession,
  items,
  categories,
  selectedCategory,
  onStartSession,
  onEndSession,
  onJoinSession,
  onOpenBarcode,
  onFocusSearch,
  onSelectCategory,
  onSelectArticle,
  onGoInventur,
  onGoAccount,
  onLogout,
}) {
  const [openSessions, setOpenSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const input = document.querySelector('[data-counting-command-input]')
      if (input instanceof HTMLInputElement) input.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || context === 'session') return
    let cancelled = false
    setSessionsLoading(true)
    ;(async () => {
      try {
        const { openSessions: openList } = await loadInventurSessionLists()
        if (!cancelled) setOpenSessions(openList)
      } catch {
        if (!cancelled) setOpenSessions([])
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, context])

  const run = (fn) => {
    fn()
    onOpenChange(false)
  }

  const recommended = useMemo(() => {
    if (context === 'session') {
      const actions = [
        { id: 'scan', label: 'Barcode scannen', icon: Barcode, run: onOpenBarcode },
        { id: 'search', label: 'Artikelsuche fokussieren', icon: Search, run: onFocusSearch },
      ]
      if (canEndSession) {
        actions.push({
          id: 'end',
          label: sessionBusy ? 'Session wird beendet…' : 'Inventur beenden (Fertig)',
          icon: Square,
          run: onEndSession,
          disabled: sessionBusy,
        })
      }
      return actions
    }
    if (context === 'account') {
      return [
        { id: 'inventur', label: 'Zu Inventuren', icon: ClipboardList, run: onGoInventur },
        { id: 'account', label: 'Account-Einstellungen', icon: User, run: onGoAccount },
      ]
    }
    return [
      {
        id: 'start',
        label: sessionBusy ? 'Session wird gestartet…' : 'Neue Inventur starten',
        icon: Play,
        run: onStartSession,
        disabled: sessionBusy,
      },
    ]
  }, [
    context,
    canEndSession,
    sessionBusy,
    onOpenBarcode,
    onFocusSearch,
    onEndSession,
    onGoInventur,
    onGoAccount,
    onStartSession,
  ])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="counting-cmdk-overlay" />
        <Dialog.Content className="counting-cmdk-content" aria-label="Suche und Aktionen">
          <Command className="counting-cmdk-command" label="Suche und Aktionen">
            <div className="counting-cmdk-input-row">
              <Search className="counting-cmdk-input-icon" size={18} strokeWidth={2} aria-hidden />
              <Command.Input
                data-counting-command-input
                placeholder="Aktion oder Artikel suchen…"
                className="counting-cmdk-input"
              />
            </div>
            <Command.List className="counting-cmdk-list">
              <Command.Empty className="counting-cmdk-empty">Keine Treffer.</Command.Empty>

              <Command.Group heading="Empfohlen" className="counting-cmdk-group">
                {recommended.map(({ id, label, icon: Icon, run: action, disabled }) => (
                  <Command.Item
                    key={id}
                    value={`empfohlen ${label}`}
                    disabled={disabled}
                    onSelect={() => {
                      if (!disabled) run(action)
                    }}
                    className="counting-cmdk-item"
                  >
                    <Icon className="counting-cmdk-item-icon" size={16} strokeWidth={2} aria-hidden />
                    {label}
                  </Command.Item>
                ))}
              </Command.Group>

              {context !== 'session' && openSessions.length > 0 ? (
                <Command.Group heading="Offene Inventuren" className="counting-cmdk-group">
                  {openSessions.map((rec) => {
                    const sub = sessionSubtitle(rec)
                    return (
                      <Command.Item
                        key={rec.id}
                        value={`session beitreten ${sub} ${rec.id}`}
                        onSelect={() => run(() => onJoinSession(rec.id))}
                        className="counting-cmdk-item"
                      >
                        <UserPlus className="counting-cmdk-item-icon" size={16} strokeWidth={2} aria-hidden />
                        <span className="counting-cmdk-item-stack">
                          <span>Session beitreten</span>
                          {sub ? <span className="counting-cmdk-item-meta">{sub}</span> : null}
                        </span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ) : null}

              {context !== 'session' && sessionsLoading ? (
                <p className="counting-cmdk-hint" role="status">
                  Offene Sessions werden geladen…
                </p>
              ) : null}

              {context === 'session' ? (
                <>
                  <Command.Group heading="Kategorien" className="counting-cmdk-group">
                    {['Alle', ...categories].map((cat) => (
                      <Command.Item
                        key={cat}
                        value={`kategorie ${cat}`}
                        onSelect={() => run(() => onSelectCategory(cat))}
                        className="counting-cmdk-item"
                      >
                        {cat}
                        {cat === selectedCategory ? (
                          <span className="counting-cmdk-item-badge">aktiv</span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Artikel" className="counting-cmdk-group">
                    {items.slice(0, 80).map((it) => (
                      <Command.Item
                        key={it.id}
                        value={`${it.artikelnummer} ${it.name} ${it.barcode ?? ''}`}
                        onSelect={() => run(() => onSelectArticle(it))}
                        className="counting-cmdk-item counting-cmdk-item--article"
                      >
                        <span className="counting-cmdk-art-nr">{it.artikelnummer || '—'}</span>
                        <span className="counting-cmdk-art-name">{it.name}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              ) : null}

              <Command.Group heading="Navigation" className="counting-cmdk-group">
                {context !== 'dashboard' ? (
                  <Command.Item
                    value="navigation inventuren"
                    onSelect={() => run(onGoInventur)}
                    className="counting-cmdk-item"
                  >
                    <ClipboardList className="counting-cmdk-item-icon" size={16} strokeWidth={2} aria-hidden />
                    Inventuren
                  </Command.Item>
                ) : null}
                {context !== 'account' ? (
                  <Command.Item
                    value="navigation account"
                    onSelect={() => run(onGoAccount)}
                    className="counting-cmdk-item"
                  >
                    <User className="counting-cmdk-item-icon" size={16} strokeWidth={2} aria-hidden />
                    Account
                  </Command.Item>
                ) : null}
                <Command.Item
                  value="navigation abmelden logout"
                  onSelect={() => run(onLogout)}
                  className="counting-cmdk-item counting-cmdk-item--danger"
                >
                  <LogOut className="counting-cmdk-item-icon" size={16} strokeWidth={2} aria-hidden />
                  Abmelden
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
