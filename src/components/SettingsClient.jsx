import { useState } from 'react'
import { loadSettings, saveSettings, loadVideoSettings, saveVideoSettings, loadS3Settings, saveS3Settings } from '../utils/storage'

export default function SettingsClient({ onClose }) {
  const saved      = loadSettings()
  const savedVideo = loadVideoSettings()
  const savedS3    = loadS3Settings()

  const [apiKey,          setApiKey]          = useState(saved.apiKey)
  const [videoEndpointId, setVideoEndpointId] = useState(savedVideo.endpointId)
  const [cfBaseUrl,       setCfBaseUrl]       = useState(savedS3.cfBaseUrl)
  const [bucket,          setBucket]          = useState(savedS3.bucket)
  const [region,          setRegion]          = useState(savedS3.region)
  const [keyId,           setKeyId]           = useState(savedS3.keyId)
  const [secret,          setSecret]          = useState(savedS3.secret)
  const [endpointUrl,     setEndpointUrl]     = useState(savedS3.endpointUrl)

  function handleSave(e) {
    e.preventDefault()
    saveSettings({ apiKey: apiKey.trim(), endpointId: '' })
    saveVideoSettings({ endpointId: videoEndpointId.trim() })
    saveS3Settings({
      cfBaseUrl:   cfBaseUrl.trim(),
      bucket:      bucket.trim(),
      region:      region.trim(),
      keyId:       keyId.trim(),
      secret:      secret.trim(),
      endpointUrl: endpointUrl.trim(),
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Settings</h2>
        <p className="settings-note">
          Saved in your browser only — sent directly to RunPod and AWS, never to any other server.
        </p>
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
            <label htmlFor="videoEndpointId">Video Endpoint ID</label>
            <input
              id="videoEndpointId"
              type="text"
              value={videoEndpointId}
              onChange={(e) => setVideoEndpointId(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>

          <hr style={{ margin: '1rem 0', borderColor: 'var(--border)' }} />
          <p className="settings-note" style={{ marginBottom: '0.75rem' }}>S3 / CloudFront (for video output)</p>

          <div className="field">
            <label htmlFor="cfBaseUrl">CloudFront Base URL</label>
            <input
              id="cfBaseUrl"
              type="text"
              value={cfBaseUrl}
              onChange={(e) => setCfBaseUrl(e.target.value)}
              placeholder="https://xxxx.cloudfront.net"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="bucket">S3 Bucket Name</label>
            <input
              id="bucket"
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-bucket"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="region">AWS Region</label>
            <input
              id="region"
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="keyId">AWS Access Key ID</label>
            <input
              id="keyId"
              type="text"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="secret">AWS Secret Access Key</label>
            <input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="endpointUrl">
              S3 Endpoint URL{' '}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — Cloudflare R2 etc.)</span>
            </label>
            <input
              id="endpointUrl"
              type="text"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://xxxx.r2.cloudflarestorage.com"
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
