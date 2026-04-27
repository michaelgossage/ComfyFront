function GenerationStatus({ status, jobId, errorMessage, onReset }) {
  if (status === 'submitting') {
    return (
      <div className="status-area">
        <div className="spinner" />
        <p>Submitting job…</p>
      </div>
    )
  }

  if (status === 'polling') {
    return (
      <div className="status-area">
        <div className="spinner" />
        <p>Generating…</p>
        {jobId && <p className="job-id">Job: {jobId}</p>}
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

function ImageCard({ image, onRatingChange, onReuseSettings }) {
  const { id, imageData, prompt, seed, steps, guidance, width, height, checkpoint, project, rating } = image
  const modelName = (checkpoint ?? '').replace('.safetensors', '').replace('.gguf', '')

  return (
    <div className="image-card">
      {/* Open full-size in new tab so actual quality is visible; download is a separate button */}
      <a href={imageData} target="_blank" rel="noopener noreferrer" title="View full size">
        <img src={imageData} alt={prompt} loading="lazy" />
      </a>
      <div className="image-meta">
        {width && height && <span>{width}×{height}</span>}
        {steps  && <span>{steps} steps</span>}
        {seed   != null && <span>#{seed}</span>}
        {modelName && <span title={checkpoint}>{modelName}</span>}
        {project && <span className="meta-project">{project}</span>}
      </div>
      <div className="image-actions">
        <button
          className={`btn-rating${rating === 'yes' ? ' active-yes' : ''}`}
          onClick={() => onRatingChange(id, rating === 'yes' ? null : 'yes')}
          title="Good image"
          aria-label="Rate good"
        >
          👍
        </button>
        <button
          className={`btn-rating${rating === 'no' ? ' active-no' : ''}`}
          onClick={() => onRatingChange(id, rating === 'no' ? null : 'no')}
          title="Bad image"
          aria-label="Rate bad"
        >
          👎
        </button>
        <a
          href={imageData}
          download={`comfyfront_${id}.png`}
          className="btn-download"
          title="Download PNG"
        >
          ↓
        </a>
        <button
          className="btn-reuse"
          onClick={() => onReuseSettings({ prompt, seed, steps, guidance, width, height, checkpoint })}
          title="Load these settings into the form"
        >
          ↩ Use
        </button>
      </div>
    </div>
  )
}

export default function ImageGallery({ status, storedImages, errorMessage, jobId, onReset, onRatingChange, onReuseSettings }) {
  return (
    <div className="gallery">
      <GenerationStatus
        status={status}
        jobId={jobId}
        errorMessage={errorMessage}
        onReset={onReset}
      />

      {storedImages.length > 0 && (
        <div className="gallery-section">
          <div className="gallery-header">
            <span>{storedImages.length} saved image{storedImages.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="image-grid">
            {storedImages.map((img) => (
              <ImageCard key={img.id} image={img} onRatingChange={onRatingChange} onReuseSettings={onReuseSettings} />
            ))}
          </div>
        </div>
      )}

      {status === 'idle' && storedImages.length === 0 && (
        <div className="status-area">
          <p className="placeholder-text">Configure settings, enter a prompt, and click Generate.</p>
        </div>
      )}
    </div>
  )
}
