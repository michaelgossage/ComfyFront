import { useState, useEffect, useRef } from 'react'
import { parseWorkflow } from '../utils/workflowParser'
import { useBatchSubmit } from '../hooks/useBatchSubmit'
import WorkflowForm from './WorkflowForm'
import logger from '../utils/logger'

const SERVER = 'http://localhost:3001'

function formatDate(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function BatchHistory() {
  const [records, setRecords] = useState([])

  useEffect(() => {
    fetch(`${SERVER}/api/batch-records`)
      .then(r => r.ok ? r.json() : [])
      .then(setRecords)
      .catch(() => setRecords([]))
  }, [])

  if (records.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No batch history yet.</p>
  }

  return (
    <div className="job-list">
      <div className="job-list-header"><span>Past Batches</span></div>
      {records.slice().reverse().map(r => (
        <div key={r.batchId} className="job-card job-card--completed">
          <span className="job-name">{r.workflowName}</span>
          <span className="job-badge job-badge--done">{r.totalJobs} jobs</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatDate(r.submittedAt)}</span>
        </div>
      ))}
    </div>
  )
}

export default function BatchRunTab() {
  const [workflows, setWorkflows]       = useState([])
  const [selected, setSelected]         = useState('')
  const [workflowJson, setWorkflowJson] = useState(null)
  const [fields, setFields]             = useState([])
  const [loadError, setLoadError]       = useState(null)
  const [imageFiles, setImageFiles]     = useState([])
  const [runsPerImage, setRunsPerImage] = useState(3)
  const fileInputRef                    = useRef(null)

  const { submitBatch, status, submitted, total, errorMsg, reset } = useBatchSubmit()

  const isSubmitting = status === 'submitting'
  const isDone       = status === 'done'
  const isError      = status === 'error'

  useEffect(() => {
    fetch(`${SERVER}/api/workflows`)
      .then(r => r.json())
      .then(names => { setWorkflows(names); if (names.length > 0) setSelected(names[0]) })
      .catch(err => logger.warn('BatchRunTab', 'Failed to load workflow list', err.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadError(null)
    fetch(`${SERVER}/api/workflows/${selected}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => {
        setWorkflowJson(json)
        // Exclude image fields — images are provided via the multi-file picker
        setFields(parseWorkflow(json).filter(f => f.type !== 'image'))
      })
      .catch(err => {
        logger.warn('BatchRunTab', 'Failed to load workflow', err.message)
        setLoadError(`Could not load workflow "${selected}": ${err.message}`)
      })
  }, [selected])

  function handleFileChange(e) {
    setImageFiles(Array.from(e.target.files))
    reset()
  }

  function removeFile(index) {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
  }

  function handleFormSubmit(_filled, fieldValues) {
    submitBatch({ imageFiles, workflow: workflowJson, workflowName: selected, runsPerImage, fieldValues })
  }

  const totalJobs = imageFiles.length * runsPerImage
  const submitLabel = isSubmitting
    ? `Submitting ${submitted} / ${total}…`
    : `Submit ${totalJobs > 0 ? totalJobs : ''} Jobs`.trim()

  return (
    <main className="app-main">
      <section className="panel panel-form">
        <div style={{ marginBottom: '1rem' }}>
          <select
            value={selected}
            onChange={e => { setSelected(e.target.value); reset() }}
            disabled={isSubmitting}
            style={{ width: '100%' }}
          >
            {workflows.length === 0
              ? <option value="">No workflows found</option>
              : workflows.map(name => <option key={name} value={name}>{name}</option>)
            }
          </select>
        </div>

        {loadError && (
          <p style={{ color: 'var(--error-text)', fontSize: 13, marginBottom: '1rem' }}>{loadError}</p>
        )}

        {/* Multi-image picker */}
        <div className="field">
          <label>Input Images</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            disabled={isSubmitting}
            onChange={handleFileChange}
          />
          {imageFiles.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              {imageFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, marginBottom: 2 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{f.name}</span>
                  <button
                    type="button"
                    className="job-dismiss"
                    onClick={() => removeFile(i)}
                    disabled={isSubmitting}
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Runs per image */}
        <div className="field">
          <label htmlFor="runs-per-image">Runs per image</label>
          <input
            id="runs-per-image"
            type="number"
            min={1}
            max={20}
            value={runsPerImage}
            onChange={e => setRunsPerImage(Math.max(1, Number(e.target.value)))}
            disabled={isSubmitting}
            style={{ width: 80 }}
          />
          {imageFiles.length > 0 && (
            <span style={{ marginLeft: '0.75rem', fontSize: 12, color: 'var(--text-muted)' }}>
              = {totalJobs} total jobs
            </span>
          )}
        </div>

        {/* Workflow params (seed auto-randomised per run) */}
        {workflowJson && fields.length > 0 && (
          <WorkflowForm
            fields={fields}
            workflowJson={workflowJson}
            uploadImage={() => Promise.resolve('')}
            onSubmit={handleFormSubmit}
            disabled={isSubmitting || isDone || imageFiles.length === 0}
            submitLabel={submitLabel}
          />
        )}

        {/* No-fields workflow: show submit button ourselves */}
        {workflowJson && fields.length === 0 && (
          <button
            className="btn-primary btn-generate"
            disabled={isSubmitting || isDone || imageFiles.length === 0}
            onClick={() => handleFormSubmit(null, {})}
          >
            {submitLabel}
          </button>
        )}

        {/* Error */}
        {isError && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--error-text)', fontSize: 13 }}>{errorMsg}</p>
            <button className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={reset}>Try again</button>
          </div>
        )}

        {/* Progress bar */}
        {isSubmitting && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ background: 'var(--accent)', height: '100%', width: `${total > 0 ? (submitted / total) * 100 : 0}%`, transition: 'width 0.2s' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Submitting {submitted} / {total} jobs…
            </p>
          </div>
        )}

        {/* Done message */}
        {isDone && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>{total} jobs submitted.</strong> You can close this window — jobs will run in the cloud. Check the RunPod Video tab later to see results in your S3 gallery.
            </p>
            <button className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => { reset(); setImageFiles([]); if (fileInputRef.current) fileInputRef.current.value = '' }}>
              Start another batch
            </button>
          </div>
        )}
      </section>

      <section className="panel panel-gallery">
        <BatchHistory />
      </section>
    </main>
  )
}
