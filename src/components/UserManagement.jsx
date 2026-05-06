import { useState, useEffect } from 'react'

const API_BASE = '/api'

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editEmail, setEditEmail] = useState('')

  const headers = () => {
    const h = { 'Content-Type': 'application/json' }
    if (currentUser?.token) {
      h.Authorization = `Bearer ${currentUser.token}`
    } else {
      h['X-User-Id'] = String(currentUser?.id ?? '')
    }
    return h
  }

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/users`, { headers: headers() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Nutzerliste konnte nicht geladen werden.')
      }
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err.message)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [currentUser?.id])

  const handleConfirm = async (id) => {
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/users/${id}/confirm`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      })
      let data = {}
      try {
        const text = await res.text()
        if (text) data = JSON.parse(text)
      } catch {
        // Antwort war kein JSON (z. B. HTML-Fehlerseite)
      }
      if (!res.ok) {
        setError(data.error || `Bestätigung fehlgeschlagen (${res.status}).`)
        return
      }
      await fetchUsers()
    } catch (err) {
      setError(err.message || 'Bestätigung fehlgeschlagen.')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Nutzer wirklich löschen?')) return
    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Löschen fehlgeschlagen.')
      }
      await fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (user) => {
    setEditingId(user.id)
    setEditEmail(user.email)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditEmail('')
  }

  const handleSaveEdit = async () => {
    if (editingId == null) return
    try {
      const res = await fetch(`${API_BASE}/users/${editingId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ email: editEmail.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Speichern fehlgeschlagen.')
      }
      setEditingId(null)
      setEditEmail('')
      await fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p className="user-mgmt-loading">Lade Nutzer …</p>
  if (error) return <p className="user-mgmt-error">{error}</p>

  return (
    <div className="user-management">
      <h2 className="user-mgmt-title">Nutzerverwaltung</h2>
      <p className="user-mgmt-hint">Neue Nutzer müssen von dir bestätigt werden. Nur bestätigte Nutzer sind voll freigeschaltet.</p>
      <ul className="user-mgmt-list">
        {users.map((user) => (
          <li key={user.id} className={`user-mgmt-item ${!user.emailConfirmed ? 'user-mgmt-item--unconfirmed' : ''}`}>
            {editingId === user.id ? (
              <div className="user-mgmt-edit">
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="user-mgmt-edit-input"
                />
                <button type="button" onClick={handleSaveEdit} className="user-mgmt-btn user-mgmt-btn--primary">
                  Speichern
                </button>
                <button type="button" onClick={cancelEdit} className="user-mgmt-btn">
                  Abbrechen
                </button>
              </div>
            ) : (
              <>
                <span className="user-mgmt-email">{user.email}</span>
                {user.isAdmin && <span className="user-mgmt-badge">Admin</span>}
                {!user.emailConfirmed && <span className="user-mgmt-badge user-mgmt-badge--warning">Unbestätigt</span>}
                <div className="user-mgmt-actions">
                  {!user.emailConfirmed && (
                    <button type="button" onClick={() => handleConfirm(user.id)} className="user-mgmt-btn user-mgmt-btn--primary">
                      Bestätigen
                    </button>
                  )}
                  {!user.isAdmin && (
                    <>
                      <button type="button" onClick={() => startEdit(user)} className="user-mgmt-btn">
                        Bearbeiten
                      </button>
                      <button type="button" onClick={() => handleDelete(user.id)} className="user-mgmt-btn user-mgmt-btn--danger">
                        Löschen
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default UserManagement
