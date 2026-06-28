import { useState, useEffect } from 'react'
import { fillWorkflow } from '../utils/workflowParser'

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

function batchItemLabel(fields, values) {
  // Use first textarea value, or first uploaded image filename
  for (const f of fields) {
    const v = values[`${f.nodeId}::${f.key}`]
    if (f.type === 'textarea' && v) return v.slice(0, 50) + (v.length > 50 ? '…' : '')
    if (f.type === 'image' && v) return `image: ${v}`
  }
  return 'item'
}

export default function WorkflowForm({ fields, workflowJson, uploadImage, onSubmit, onAddToBatch, batchQueue, onRemoveFromBatch, onRunBatch, disabled, initialValues, submitLabel }) {
  const [values, setValues]     = useState({})
  const [previews, setPreviews] = useState({})

  // Reset form values when workflow changes, applying any initialValues overrides
  useEffect(() => {
    const initial = {}
    for (const f of fields) {
      const key = `${f.nodeId}::${f.key}`
      initial[key] = (initialValues && initialValues[key] != null)
        ? initialValues[key]
        : (f.type === 'image' ? '' : f.defaultValue)
    }
    setValues(initial)
    setPreviews({})
  }, [fields, initialValues])

  function setValue(fieldKey, value) {
    setValues(prev => ({ ...prev, [fieldKey]: value }))
  }

  async function handleImageChange(fieldKey, file) {
    if (!file) return
    setPreviews(prev => ({ ...prev, [fieldKey]: URL.createObjectURL(file) }))
    try {
      const comfyName = await uploadImage(file)
      setValue(fieldKey, comfyName)
    } catch (err) {
      alert(`Image upload failed: ${err.message}`)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(fillWorkflow(workflowJson, values), values)
  }

  function handleAddToBatch() {
    onAddToBatch(values, batchItemLabel(fields, values))
  }

  if (!fields.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>This workflow has no configurable inputs.</p>
  }

  const hasBatch = onAddToBatch != null

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((field) => {
        const fieldKey = `${field.nodeId}::${field.key}`
        const value = values[fieldKey] ?? ''

        return (
          <div className="field" key={fieldKey}>
            <label htmlFor={fieldKey}>{field.label}</label>

            {field.type === 'textarea' && (
              <textarea
                id={fieldKey}
                rows={3}
                value={value}
                onChange={e => setValue(fieldKey, e.target.value)}
                disabled={disabled}
              />
            )}

            {field.type === 'image' && (
              <div>
                <input
                  id={fieldKey}
                  type="file"
                  accept="image/*"
                  disabled={disabled}
                  onChange={e => handleImageChange(fieldKey, e.target.files[0])}
                  style={{ marginBottom: previews[fieldKey] ? '0.5rem' : 0 }}
                />
                {previews[fieldKey] && (
                  <img
                    src={previews[fieldKey]}
                    alt="preview"
                    style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                  />
                )}
                {value && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '0.25rem' }}>Uploaded: {value}</p>}
              </div>
            )}

            {field.type === 'number' && (
              <div className={field.isSeed ? 'seed-row' : ''}>
                <input
                  id={fieldKey}
                  type="number"
                  value={value}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  onChange={e => setValue(fieldKey, Number(e.target.value))}
                  disabled={disabled}
                />
                {field.isSeed && (
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setValue(fieldKey, randomSeed())}
                    disabled={disabled}
                    title="Random seed"
                  >↺</button>
                )}
              </div>
            )}

            {field.type === 'text' && (
              <input
                id={fieldKey}
                type="text"
                value={value}
                onChange={e => setValue(fieldKey, e.target.value)}
                disabled={disabled}
              />
            )}
          </div>
        )
      })}

      {/* Batch queue list */}
      {hasBatch && batchQueue.length > 0 && (
        <div className="batch-list">
          {batchQueue.map((item, i) => (
            <div key={item.id} className="batch-item">
              <span className="batch-item-num">{i + 1}</span>
              <span className="batch-item-label">{item.label}</span>
              <button
                type="button"
                className="batch-item-remove"
                onClick={() => onRemoveFromBatch(item.id)}
                disabled={disabled}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className={hasBatch ? 'batch-actions' : ''}>
        {hasBatch && (
          <button
            type="button"
            className="btn-secondary btn-generate"
            onClick={handleAddToBatch}
            disabled={disabled}
          >
            + Add to Batch
          </button>
        )}
        <button type="submit" className="btn-primary btn-generate" disabled={disabled}>
          {submitLabel ?? (disabled ? 'Generating…' : 'Generate Now')}
        </button>
      </div>

      {hasBatch && batchQueue.length > 0 && (
        <button
          type="button"
          className="btn-primary btn-generate"
          style={{ marginTop: '0.5rem' }}
          onClick={onRunBatch}
          disabled={disabled}
        >
          {disabled ? 'Generating…' : `Run Batch (${batchQueue.length})`}
        </button>
      )}
    </form>
  )
}
