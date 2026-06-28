import { useState, useEffect, useRef } from 'react'
import { useLocalComfy } from '../hooks/useLocalComfy'
import { parseWorkflow, fillWorkflow } from '../utils/workflowParser'
import { getAllImages, updateRating } from '../utils/imageStore'
import WorkflowForm from './WorkflowForm'
import MediaGallery from './MediaGallery'
import LocalSettings from './LocalSettings'
import logger from '../utils/logger'

const SERVER = 'http://localhost:3001'

export default function LocalComfyTab({ project }) {
  const [workflows, setWorkflows]         = useState([])
  const [selected, setSelected]           = useState('')
  const [workflowJson, setWorkflowJson]   = useState(null)
  const [fields, setFields]               = useState([])
  const [storedOutputs, setStoredOutputs] = useState([])
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [loadError, setLoadError]         = useState(null)
  const [reuseValues, setReuseValues]     = useState(null)

  // Batch state
  const [batchQueue, setBatchQueue]   = useState([])   // items waiting to run
  const [batchIndex, setBatchIndex]   = useState(0)    // how many have run so far
  const [batchTotal, setBatchTotal]   = useState(0)    // total items in the current run
  const batchQueueRef                 = useRef([])     // mutable ref used inside the effect

  const { submit, uploadImage, status, progress, outputs, errorMessage, reset } = useLocalComfy()

  const isGenerating = status === 'connecting' || status === 'generating' || status === 'fetching'

  // Load workflow list on mount
  useEffect(() => {
    fetch(`${SERVER}/api/workflows`)
      .then(r => r.json())
      .then(names => {
        setWorkflows(names)
        if (names.length > 0) setSelected(names[0])
      })
      .catch(err => logger.warn('LocalComfyTab', 'Failed to load workflow list', err.message))
  }, [])

  // Load selected workflow JSON and parse its fields
  useEffect(() => {
    if (!selected) return
    setLoadError(null)
    fetch(`${SERVER}/api/workflows/${selected}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        setWorkflowJson(json)
        setFields(parseWorkflow(json))
      })
      .catch(err => {
        logger.warn('LocalComfyTab', 'Failed to load workflow', err.message)
        setLoadError(`Could not load workflow "${selected}": ${err.message}`)
      })
  }, [selected])

  // Load stored outputs from IndexedDB, refresh after each completed generation
  useEffect(() => {
    getAllImages()
      .then(all => setStoredOutputs(all.filter(r => r.mediaType)))
      .catch(err => logger.error('LocalComfyTab', 'Failed to load stored outputs', err))
  }, [])

  useEffect(() => {
    if (status !== 'completed') return
    // Refresh gallery
    getAllImages()
      .then(all => setStoredOutputs(all.filter(r => r.mediaType)))
      .catch(err => logger.error('LocalComfyTab', 'Failed to refresh outputs', err))
    // Submit next batch item if any remain
    if (batchQueueRef.current.length === 0) {
      setBatchTotal(0)
      return
    }
    const next = batchQueueRef.current.shift()
    setBatchIndex(i => i + 1)
    submit(next.filledWorkflow, project, next.workflowName ?? selected, next.fieldValues ?? {})
  }, [status])

  async function handleRatingChange(id, rating) {
    try {
      await updateRating(id, rating)
      setStoredOutputs(prev => prev.map(r => r.id === id ? { ...r, rating } : r))
    } catch (err) {
      logger.error('LocalComfyTab', 'Failed to update rating', err)
    }
  }

  function handleReuseSettings(record) {
    if (record.workflowName && record.workflowName !== selected) {
      setSelected(record.workflowName)
    }
    setReuseValues(record.fieldValues ?? {})
  }

  function handleAddToBatch(values, label) {
    const filledWorkflow = fillWorkflow(workflowJson, values)
    setBatchQueue(prev => [...prev, { id: crypto.randomUUID(), filledWorkflow, label, workflowName: selected, fieldValues: values }])
  }

  function handleRemoveFromBatch(id) {
    setBatchQueue(prev => prev.filter(item => item.id !== id))
  }

  function handleRunBatch() {
    if (batchQueue.length === 0) return
    const items = [...batchQueue]
    setBatchQueue([])
    batchQueueRef.current = items.slice(1)  // rest will run after first completes
    setBatchTotal(items.length)
    setBatchIndex(1)
    submit(items[0].filledWorkflow, project, items[0].workflowName ?? selected, items[0].fieldValues ?? {})
  }

  return (
    <main className="app-main">
      {settingsOpen && <LocalSettings onClose={() => setSettingsOpen(false)} />}

      <section className="panel panel-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <select
            value={selected}
            onChange={e => { setSelected(e.target.value); reset(); setBatchQueue([]) }}
            disabled={isGenerating}
            style={{ flex: 1, marginRight: '0.5rem' }}
          >
            {workflows.length === 0
              ? <option value="">No workflows found</option>
              : workflows.map(name => <option key={name} value={name}>{name}</option>)
            }
          </select>
          <button className="btn-secondary btn-small" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>

        {loadError && (
          <p style={{ color: 'var(--error-text)', fontSize: 13, marginBottom: '1rem' }}>{loadError}</p>
        )}

        {workflows.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Add .json workflow files to the <code>workflows/</code> folder and restart the server.
          </p>
        )}

        {workflowJson && (
          <WorkflowForm
            fields={fields}
            workflowJson={workflowJson}
            uploadImage={uploadImage}
            onSubmit={(filled, values) => submit(filled, project, selected, values)}
            onAddToBatch={handleAddToBatch}
            batchQueue={batchQueue}
            onRemoveFromBatch={handleRemoveFromBatch}
            onRunBatch={handleRunBatch}
            disabled={isGenerating}
            initialValues={reuseValues}
          />
        )}
      </section>

      <section className="panel panel-gallery">
        <MediaGallery
          status={status}
          progress={progress}
          batchIndex={batchIndex}
          batchTotal={batchTotal}
          storedOutputs={storedOutputs}
          errorMessage={errorMessage}
          onReset={reset}
          onRatingChange={handleRatingChange}
          onReuseSettings={handleReuseSettings}
        />
      </section>
    </main>
  )
}
