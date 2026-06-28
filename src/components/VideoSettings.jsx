import { useState } from 'react'
import { loadVideoSettings, saveVideoSettings } from '../utils/storage'

export default function VideoSettings({ onClose }) {
  const saved = loadVideoSettings()
  const [endpointId, setEndpointId] = useState(saved.endpointId)

  function handleSave(e) {
    e.preventDefault()
    saveVideoSettings({ endpointId: endpointId.trim() })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>RunPod Video Settings</h2>
        <p className="settings-note">Saved to this browser only. API key is shared with the RunPod image tab (set in the header Settings button).</p>
        <form onSubmit={handleSave}>
          <div className="field">
            <label htmlFor="video-endpoint-id">Video Endpoint ID</label>
            <input
              id="video-endpoint-id"
              type="text"
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              placeholder="e.g. abc123xyz"
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
