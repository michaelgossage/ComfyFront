import { useState } from 'react'
import { loadLocalSettings, saveLocalSettings } from '../utils/storage'

export default function LocalSettings({ onClose }) {
  const saved = loadLocalSettings()
  const [host, setHost] = useState(saved.host)
  const [port, setPort] = useState(saved.port)

  function handleSave(e) {
    e.preventDefault()
    saveLocalSettings({ host: host.trim(), port: port.trim() })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Local ComfyUI Settings</h2>
        <p className="settings-note">Saved to this browser only. Used for local network connections.</p>
        <form onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="comfy-host">Host</label>
            <input
              id="comfy-host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="comfy-port">Port</label>
            <input
              id="comfy-port"
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8188"
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
