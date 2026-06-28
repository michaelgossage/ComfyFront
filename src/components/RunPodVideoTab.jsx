import { useState, useEffect, useRef, useCallback } from 'react'
import { useVideoQueue } from '../hooks/useVideoQueue'
import { parseWorkflow } from '../utils/workflowParser'
import { getAllImages, updateRating } from '../utils/imageStore'
import { loadS3Settings } from '../utils/storage'
import { listS3VideoOutputs } from '../utils/s3Browser'
import WorkflowForm from './WorkflowForm'
import MediaGallery from './MediaGallery'
import logger from '../utils/logger'

const SERVER = 'http://localhost:3001'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatElapsed(ms) {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function JobList({ jobs, cancelJob, dismissJob, clearCompleted, now }) {
  const active = jobs.filter(j => j.status === 'running' || j.status === 'failed')
  const done   = jobs.filter(j => j.status === 'completed')
  if (jobs.length === 0) return null

  return (
    <div className="job-list">
      <div className="job-list-header">
        <span>Jobs</span>
        {done.length > 0 && (
          <button className="btn-secondary btn-small" onClick={clearCompleted}>Clear done</button>
        )}
      </div>
      {jobs.map(job => (
        <div key={job.queueId} className={`job-card job-card--${job.status}`}>
          <span className="job-name">{job.workflowName || 'Video'}</span>
          {job.status === 'running' && (
            <>
              <div className="spinner-sm" />
              <span className="job-elapsed">{formatElapsed(now - job.submittedAt)}</span>
              <button className="job-dismiss" onClick={() => cancelJob(job.queueId)} title="Cancel job">✕</button>
            </>
          )}
          {job.status === 'completed' && <span className="job-badge job-badge--done">Done</span>}
          {job.status === 'failed' && (
            <span className="job-badge job-badge--fail" title={job.errorMessage}>Failed</span>
          )}
          {job.status !== 'running' && (
            <button className="job-dismiss" onClick={() => dismissJob(job.queueId)} title="Dismiss">✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

// workflowsMap: optional { name: workflowJson } — when provided, skips server fetch (client build)
// useServerProxy: when false, calls S3 directly from browser instead of via local server
export default function RunPodVideoTab({ project, workflowsMap, useServerProxy = true }) {
  const [workflows, setWorkflows]         = useState([])
  const [selected, setSelected]           = useState('')
  const [workflowJson, setWorkflowJson]   = useState(null)
  const [fields, setFields]               = useState([])
  const [storedOutputs, setStoredOutputs] = useState([])
  const [loadError, setLoadError]         = useState(null)
  const [reuseValues, setReuseValues]     = useState(null)
  const [now, setNow]                     = useState(Date.now())

  const pendingImagesRef = useRef({})

  const { jobs, enqueue, cancelJob, dismissJob, clearCompleted, enqueueError } = useVideoQueue({ useServerProxy })

  const runningCount  = jobs.filter(j => j.status === 'running').length
  const isAtCapacity  = runningCount >= 3

  // Live elapsed timer — only ticks when jobs are running
  useEffect(() => {
    if (runningCount === 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [runningCount])

  // Load gallery from S3 if configured, otherwise fall back to IndexedDB
  const refreshGallery = useCallback(async () => {
    const s3 = loadS3Settings()
    if (s3.bucket && s3.region && s3.keyId && s3.secret && s3.cfBaseUrl) {
      try {
        let items
        if (useServerProxy) {
          const res = await fetch(`${SERVER}/api/s3-outputs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bucket:         s3.bucket,
              region:         s3.region,
              keyId:          s3.keyId,
              secret:         s3.secret,
              cloudfrontBase: s3.cfBaseUrl,
              endpointUrl:    s3.endpointUrl || undefined,
            }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          items = await res.json()
        } else {
          items = await listS3VideoOutputs({
            bucket:         s3.bucket,
            region:         s3.region,
            keyId:          s3.keyId,
            secret:         s3.secret,
            cloudfrontBase: s3.cfBaseUrl,
            endpointUrl:    s3.endpointUrl || undefined,
          })
        }
        setStoredOutputs(items.map(item => ({
          id:         `s3_${item.filename}`,
          timestamp:  item.lastModified ? new Date(item.lastModified).getTime() : null,
          mediaType:  'video',
          mediaUrl:   item.url,
          displayUrl: item.url,
          filename:   item.filename,
          imageData:  null,
          rating:     null,
        })))
        return
      } catch (err) {
        logger.warn('RunPodVideoTab', 'S3 gallery load failed', err.message)
      }
    }
    getAllImages()
      .then(all => setStoredOutputs(all.filter(r => r.mediaType === 'video')))
      .catch(err => logger.error('RunPodVideoTab', 'Failed to load stored outputs', err))
  }, [useServerProxy])

  useEffect(() => {
    if (workflowsMap) {
      const names = Object.keys(workflowsMap)
      setWorkflows(names)
      if (names.length > 0) setSelected(names[0])
      return
    }
    fetch(`${SERVER}/api/workflows`)
      .then(r => r.json())
      .then(names => { setWorkflows(names); if (names.length > 0) setSelected(names[0]) })
      .catch(err => logger.warn('RunPodVideoTab', 'Failed to load workflow list', err.message))
  }, [workflowsMap])

  useEffect(() => {
    if (!selected) return
    setLoadError(null)
    if (workflowsMap) {
      const json = workflowsMap[selected]
      if (json) { setWorkflowJson(json); setFields(parseWorkflow(json)) }
      else setLoadError(`Workflow "${selected}" not found in bundle.`)
      return
    }
    fetch(`${SERVER}/api/workflows/${selected}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => { setWorkflowJson(json); setFields(parseWorkflow(json)) })
      .catch(err => {
        logger.warn('RunPodVideoTab', 'Failed to load workflow', err.message)
        setLoadError(`Could not load workflow "${selected}": ${err.message}`)
      })
  }, [selected, workflowsMap])

  useEffect(() => { refreshGallery() }, [refreshGallery])

  // Refresh gallery whenever a new job completes
  const prevCompletedRef = useRef(jobs.filter(j => j.status === 'completed').length)
  useEffect(() => {
    const completedCount = jobs.filter(j => j.status === 'completed').length
    if (completedCount > prevCompletedRef.current) refreshGallery()
    prevCompletedRef.current = completedCount
  }, [jobs, refreshGallery])

  async function handleRatingChange(id, rating) {
    try {
      await updateRating(id, rating)
      setStoredOutputs(prev => prev.map(r => r.id === id ? { ...r, rating } : r))
    } catch (err) {
      logger.error('RunPodVideoTab', 'Failed to update rating', err)
    }
  }

  async function uploadImage(file) {
    pendingImagesRef.current[file.name] = file
    return file.name
  }

  async function handleSubmit(filled, values) {
    const images = await Promise.all(
      Object.entries(pendingImagesRef.current).map(async ([name, file]) => ({
        name,
        image: await fileToBase64(file),
      }))
    )
    enqueue(filled, project, selected, values, images)
  }

  function handleReuseSettings(record) {
    if (record.workflowName && record.workflowName !== selected) setSelected(record.workflowName)
    setReuseValues(record.fieldValues ?? {})
  }

  return (
    <main className="app-main">
      <section className="panel panel-form">
        <div style={{ marginBottom: '1rem' }}>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            disabled={false}
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

        {(enqueueError) && (
          <p style={{ color: 'var(--error-text)', fontSize: 13, marginBottom: '1rem' }}>{enqueueError}</p>
        )}

        {workflowJson && (
          <WorkflowForm
            fields={fields}
            workflowJson={workflowJson}
            uploadImage={uploadImage}
            onSubmit={handleSubmit}
            disabled={isAtCapacity}
            initialValues={reuseValues}
            submitLabel={isAtCapacity ? '3 jobs running…' : 'Generate'}
          />
        )}

        <JobList jobs={jobs} cancelJob={cancelJob} dismissJob={dismissJob} clearCompleted={clearCompleted} now={now} />
      </section>

      <section className="panel panel-gallery">
        <MediaGallery
          status="idle"
          progress={{ value: 0, max: 0 }}
          storedOutputs={storedOutputs}
          errorMessage={null}
          onReset={null}
          onRatingChange={handleRatingChange}
          onReuseSettings={handleReuseSettings}
          onRefresh={refreshGallery}
        />
      </section>
    </main>
  )
}
