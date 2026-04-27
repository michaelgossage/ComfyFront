import { useState } from 'react'
import { loadSettings, saveSettings } from '../utils/storage'

export default function Settings({ onClose }) {
  const saved = loadSettings()
  const [apiKey, setApiKey] = useState(saved.apiKey)
  const [endpointId, setEndpointId] = useState(saved.endpointId)

  function handleSave(e) {
    e.preventDefault()
    saveSettings({ apiKey: apiKey.trim(), endpointId: endpointId.trim() })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Settings</h2>
        <p className="settings-note">Saved to this browser only. Sent only to RunPod.</p>
        <form onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="apiKey">RunPod API Key</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rpa_xxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="endpointId">Endpoint ID</label>
            <input
              id="endpointId"
              type="text"
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
