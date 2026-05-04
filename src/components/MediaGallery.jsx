const SERVER = 'http://localhost:3001'

function GenerationStatus({ status, progress, batchIndex, batchTotal, errorMessage, onReset }) {
  if (status === 'connecting') {
    return (
      <div className="status-area">
        <div className="spinner" />
        <p>Connecting…</p>
      </div>
    )
  }

  if (status === 'generating' || status === 'fetching') {
    const batchLabel = batchTotal > 1 ? ` (${batchIndex} / ${batchTotal})` : ''
    return (
      <div className="status-area">
        <div className="spinner" />
        <p>{status === 'fetching' ? `Saving outputs…${batchLabel}` : `Generating…${batchLabel}`}</p>
        {status === 'generating' && progress.max > 0 && (
          <progress value={progress.value} max={progress.max} style={{ width: '200px' }} />
        )}
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="status-area">
        <div className="error-box">
          <p>{errorMessage || 'An unknown error occurred.'}</p>
        </div>
        <button className="btn-secondary" onClick={onReset}>Try Again</button>
      </div>
    )
  }

  return null
}

function MediaCard({ record, onRatingChange }) {
  const { id, mediaType, imageData, mediaUrl, displayUrl, filename, project, rating } = record

  const mediaSrc = mediaType === 'image'
    ? imageData
    : (displayUrl || (mediaUrl ? `${SERVER}${mediaUrl}` : null))

  const downloadHref = mediaType === 'image' ? imageData : mediaSrc
  const downloadName = filename || `comfyfront_${id}`

  return (
    <div className="image-card">
      <div style={{ background: '#000', display: 'flex', justifyContent: 'center' }}>
        {mediaType === 'video' || mediaType === 'gif' ? (
          <video
            controls
            loop
            src={mediaSrc}
            style={{ maxWidth: '100%', maxHeight: '480px', display: 'block', borderBottom: '1px solid var(--border)' }}
          />
        ) : (
          <a href={imageData} target="_blank" rel="noopener noreferrer" title="View full size">
            <img src={imageData} alt="" loading="lazy" />
          </a>
        )}
      </div>

      <div className="image-meta">
        {filename && <span>{filename}</span>}
        {project && <span className="meta-project">{project}</span>}
      </div>

      <div className="image-actions">
        <button
          className={`btn-rating${rating === 'yes' ? ' active-yes' : ''}`}
          onClick={() => onRatingChange(id, rating === 'yes' ? null : 'yes')}
          title="Good" aria-label="Rate good"
        >👍</button>
        <button
          className={`btn-rating${rating === 'no' ? ' active-no' : ''}`}
          onClick={() => onRatingChange(id, rating === 'no' ? null : 'no')}
          title="Bad" aria-label="Rate bad"
        >👎</button>
        {downloadHref && (
          <a href={downloadHref} download={downloadName} className="btn-download" title="Download">↓</a>
        )}
      </div>
    </div>
  )
}

export default function MediaGallery({ status, progress, batchIndex, batchTotal, storedOutputs, errorMessage, onReset, onRatingChange }) {
  return (
    <div className="gallery">
      <GenerationStatus
        status={status}
        progress={progress}
        batchIndex={batchIndex}
        batchTotal={batchTotal}
        errorMessage={errorMessage}
        onReset={onReset}
      />

      {storedOutputs.length > 0 && (
        <div className="gallery-section">
          <div className="gallery-header">
            <span>{storedOutputs.length} output{storedOutputs.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="image-grid">
            {storedOutputs.map((record) => (
              <MediaCard key={record.id} record={record} onRatingChange={onRatingChange} />
            ))}
          </div>
        </div>
      )}

      {status === 'idle' && storedOutputs.length === 0 && (
        <div className="status-area">
          <p className="placeholder-text">Select a workflow, fill in the fields, and click Generate.</p>
        </div>
      )}
    </div>
  )
}
