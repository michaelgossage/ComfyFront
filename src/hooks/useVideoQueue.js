import { useState, useRef, useEffect, useCallback } from 'react'
import { loadSettings, loadVideoSettings, loadS3Settings } from '../utils/storage'
import { loadQueue, saveQueue, addJob, updateJob } from '../utils/jobQueue'
import { saveImage } from '../utils/imageStore'
import { listS3VideoOutputs } from '../utils/s3Browser'
import logger from '../utils/logger'

const RUNPOD_BASE     = 'https://api.runpod.ai/v2'
const SERVER          = 'http://localhost:3001'
const POLL_INTERVAL_MS = 3000
const TERMINAL        = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])
const MAX_CONCURRENT  = 3

// Parses the various output shapes that worker-comfyui can return.
// Returns { type, ...fields } or null.
function extractOutput(output) {
  if (!output) return null

  if (output.videos?.[0]?.url)  return { type: 'video_url', url: output.videos[0].url }
  if (output.video_url)          return { type: 'video_url', url: output.video_url }
  if (output.url)                return { type: 'video_url', url: output.url }
  if (output.files?.[0]?.url)   return { type: 'video_url', url: output.files[0].url }
  if (Array.isArray(output) && typeof output[0] === 'string' && output[0].startsWith('http'))
    return { type: 'video_url', url: output[0] }

  const imgs = Array.isArray(output.images) ? output.images : []
  if (imgs.length > 0) {
    const first = imgs[0]
    if (first.url?.startsWith('http'))       return { type: 'video_url', url: first.url }
    if (first.url?.startsWith('data:video')) return { type: 'video_b64', data: first.url, filename: first.filename ?? 'output.mp4' }
    if (first.image) {
      const data = first.image.startsWith('data:') ? first.image : `data:image/png;base64,${first.image}`
      return { type: 'image_b64', data, filename: first.filename ?? 'frame.png' }
    }
  }

  if (typeof output === 'string' && output.startsWith('data:video'))
    return { type: 'video_b64', data: output, filename: 'output.mp4' }

  return null
}

export function useVideoQueue({ useServerProxy = true } = {}) {
  const [jobs, setJobs]               = useState(() => loadQueue())
  const [enqueueError, setEnqueueError] = useState(null)

  const intervalRef   = useRef(null)
  const jobsRef       = useRef(jobs)
  const pollCountsRef = useRef({}) // { [queueId]: number }

  // Keep ref in sync with state so interval callbacks see current data
  useEffect(() => { jobsRef.current = jobs }, [jobs])

  function startPolling() {
    if (intervalRef.current) return
    intervalRef.current = setInterval(pollAll, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    clearInterval(intervalRef.current)
    intervalRef.current = null
  }

  // Resume polling on mount for any persisted running jobs
  useEffect(() => {
    if (jobsRef.current.some(j => j.status === 'running')) startPolling()
    return stopPolling
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function mutateJob(queueId, updates) {
    updateJob(queueId, updates)
    setJobs(prev => prev.map(j => j.queueId === queueId ? { ...j, ...updates } : j))
  }

  async function failJob(entry, errorMessage) {
    const nowMs     = Date.now()
    const pollCount = pollCountsRef.current[entry.queueId] ?? 0
    mutateJob(entry.queueId, { status: 'failed', errorMessage })
    await saveImage({
      id:           `rp_fail_${nowMs}_${entry.jobId}`,
      timestamp:    nowMs,
      project:      entry.project,
      workflowName: entry.workflowName,
      fieldValues:  entry.fieldValues,
      mediaType:    'failed',
      errorMessage,
      submittedAt:  entry.submittedAt,
      durationMs:   nowMs - entry.submittedAt,
      pollCount,
      imageData: null, mediaUrl: null, displayUrl: null, filename: null, rating: null,
    }).catch(e => logger.warn('useVideoQueue', 'Failed to save failure record', e))
  }

  async function pollAll() {
    const running = jobsRef.current.filter(j => j.status === 'running')
    if (running.length === 0) { stopPolling(); return }
    await Promise.all(running.map(entry =>
      pollOne(entry).catch(err =>
        logger.error('useVideoQueue', 'Poll error', { queueId: entry.queueId, message: err.message })
      )
    ))
  }

  async function pollOne(entry) {
    const { apiKey } = loadSettings()
    const endpointId = entry.endpointId  // use the endpoint the job was submitted to

    pollCountsRef.current[entry.queueId] = (pollCountsRef.current[entry.queueId] ?? 0) + 1

    if (!endpointId) {
      await failJob(entry, 'No endpoint ID — resubmit the job.')
      return
    }

    const res = await fetch(`${RUNPOD_BASE}/${endpointId}/status/${entry.jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      if (res.status === 404) {
        logger.info('useVideoQueue', 'Job 404 — checking S3 before failing', { jobId: entry.jobId })
        const s3Results = await fetchS3(entry.jobId)
        if (s3Results.length > 0) {
          await saveS3Records(entry, s3Results, pollCountsRef.current[entry.queueId] ?? 0)
        } else {
          await failJob(entry, 'Job not found on RunPod (expired or wrong endpoint).')
        }
        return
      }
      throw new Error(`Status HTTP ${res.status}`)
    }
    const data = await res.json()

    if (!TERMINAL.has(data.status)) return

    const pollCount = pollCountsRef.current[entry.queueId] ?? 0

    if (data.status !== 'COMPLETED') {
      // Worker may have uploaded to S3 before RunPod marked the job as failed
      const runpodError = `Job ${data.status.toLowerCase()}. ${data.error ?? ''}`.trim()
      logger.info('useVideoQueue', `RunPod status ${data.status} — checking S3 before failing`, { jobId: entry.jobId })
      const s3Results = await fetchS3(entry.jobId)
      if (s3Results.length > 0) {
        await saveS3Records(entry, s3Results, pollCount)
      } else {
        await failJob(entry, runpodError)
      }
      return
    }

    logger.info('useVideoQueue', 'Job completed', { jobId: entry.jobId })
    await handleCompletion(entry, data, pollCount)
  }

  // List objects in S3/R2 for a given RunPod jobId. Returns [] on any error.
  async function fetchS3(jobId) {
    const s3 = loadS3Settings()
    if (!s3.bucket || !s3.region || !s3.keyId || !s3.secret || !s3.cfBaseUrl) return []
    try {
      if (!useServerProxy) {
        return await listS3VideoOutputs({
          bucket:         s3.bucket,
          region:         s3.region,
          keyId:          s3.keyId,
          secret:         s3.secret,
          cloudfrontBase: s3.cfBaseUrl,
          endpointUrl:    s3.endpointUrl || undefined,
          jobId,
        })
      }
      const res = await fetch(`${SERVER}/api/s3-outputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          bucket:         s3.bucket,
          region:         s3.region,
          keyId:          s3.keyId,
          secret:         s3.secret,
          cloudfrontBase: s3.cfBaseUrl,
          endpointUrl:    s3.endpointUrl || undefined,
        }),
      })
      return res.ok ? await res.json() : []
    } catch (e) {
      logger.warn('useVideoQueue', 'S3 listing failed', e.message)
      return []
    }
  }

  // Build video records from S3 results and save to IndexedDB.
  async function saveS3Records(entry, s3Results, pollCount) {
    const nowMs   = Date.now()
    const records = s3Results.map((item, i) => {
      const lastMod = item.lastModified ? new Date(item.lastModified).getTime() : nowMs
      return {
        id:           `rp_video_${nowMs}_${entry.jobId}_${i}`,
        timestamp:    lastMod,
        project:      entry.project,
        workflowName: entry.workflowName,
        fieldValues:  entry.fieldValues,
        mediaType:    'video',
        mediaUrl:     item.url,
        displayUrl:   item.url,
        filename:     item.filename,
        imageData:    null,
        rating:       null,
        submittedAt:  entry.submittedAt,
        durationMs:   lastMod - entry.submittedAt,
        pollCount,
      }
    })
    await Promise.all(records.map(r =>
      saveImage(r).catch(e => logger.warn('useVideoQueue', 'IndexedDB save failed', e))
    ))
    mutateJob(entry.queueId, { status: 'completed' })
  }

  async function handleCompletion(entry, data, pollCount) {
    logger.info('useVideoQueue', 'Raw output', data.output)

    const result = extractOutput(data.output)
    const nowMs  = Date.now()

    if (!result) {
      // S3 fallback — list objects uploaded by the worker
      const s3Results = await fetchS3(entry.jobId)

      if (s3Results.length === 0) {
        await failJob(entry, 'Job completed but no video found in output or S3.')
        return
      }

      await saveS3Records(entry, s3Results, pollCount)
      return
    }

    // Direct output from RunPod response
    const id = `rp_video_${nowMs}_${entry.jobId}`
    let record

    if (result.type === 'video_url') {
      record = {
        id, timestamp: nowMs,
        project: entry.project, workflowName: entry.workflowName, fieldValues: entry.fieldValues,
        mediaType: 'video', mediaUrl: result.url, displayUrl: result.url,
        filename: result.url.split('/').pop().split('?')[0],
        imageData: null, rating: null,
        submittedAt: entry.submittedAt, durationMs: nowMs - entry.submittedAt, pollCount,
      }
    } else if (result.type === 'video_b64') {
      let mediaUrl = null
      try {
        const saveRes = await fetch(`${SERVER}/api/save-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, mediaData: result.data, filename: result.filename, metadata: { project: entry.project } }),
        })
        if (saveRes.ok) mediaUrl = (await saveRes.json()).url
      } catch (e) { logger.warn('useVideoQueue', 'Failed to save video to server', e.message) }
      record = {
        id, timestamp: nowMs,
        project: entry.project, workflowName: entry.workflowName, fieldValues: entry.fieldValues,
        mediaType: 'video', mediaUrl,
        displayUrl: mediaUrl ? `${SERVER}${mediaUrl}` : result.data,
        filename: result.filename, imageData: null, rating: null,
        submittedAt: entry.submittedAt, durationMs: nowMs - entry.submittedAt, pollCount,
      }
    } else {
      // image_b64 — frame from SaveImage node
      try {
        await fetch(`${SERVER}/api/save-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, imageData: result.data, metadata: { project: entry.project, filename: result.filename } }),
        })
      } catch (e) { logger.warn('useVideoQueue', 'Failed to save frame to server', e.message) }
      record = {
        id, timestamp: nowMs,
        project: entry.project, workflowName: entry.workflowName, fieldValues: entry.fieldValues,
        mediaType: 'image', mediaUrl: null, displayUrl: null,
        imageData: result.data, filename: result.filename, rating: null,
        submittedAt: entry.submittedAt, durationMs: nowMs - entry.submittedAt, pollCount,
      }
    }

    await saveImage(record).catch(e => logger.warn('useVideoQueue', 'IndexedDB save failed', e))
    mutateJob(entry.queueId, { status: 'completed' })
  }

  const enqueue = useCallback(async (filledWorkflow, project, workflowName, fieldValues, images = []) => {
    setEnqueueError(null)

    const running = jobsRef.current.filter(j => j.status === 'running')
    if (running.length >= MAX_CONCURRENT) {
      setEnqueueError(`${MAX_CONCURRENT} jobs already running — wait for one to finish.`)
      return
    }

    const { apiKey }     = loadSettings()
    const { endpointId } = loadVideoSettings()

    if (!apiKey)     { setEnqueueError('No API key set in Settings.'); return }
    if (!endpointId) { setEnqueueError('No video endpoint ID set in Settings.'); return }

    let jobId
    try {
      const res = await fetch(`${RUNPOD_BASE}/${endpointId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: { workflow: filledWorkflow, images } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`)
      const data = await res.json()
      jobId = data.id
      if (!jobId) throw new Error('No job ID returned from RunPod.')
    } catch (err) {
      setEnqueueError(`Submit failed: ${err.message}`)
      return
    }

    const entry = {
      queueId:      crypto.randomUUID(),
      jobId,
      endpointId,
      status:       'running',
      submittedAt:  Date.now(),
      workflowName,
      project,
      fieldValues,
      errorMessage: null,
    }

    addJob(entry)
    setJobs(prev => [...prev, entry])
    pollCountsRef.current[entry.queueId] = 0
    startPolling()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelJob(queueId) {
    const { apiKey } = loadSettings()
    const entry = jobsRef.current.find(j => j.queueId === queueId)
    if (!entry || entry.status !== 'running') return

    try {
      await fetch(`${RUNPOD_BASE}/${entry.endpointId}/cancel/${entry.jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch (e) {
      logger.warn('useVideoQueue', 'Cancel request failed', e.message)
    }
    await failJob(entry, 'Cancelled by user.')
  }

  function dismissJob(queueId) {
    const next = jobsRef.current.filter(j => j.queueId !== queueId)
    saveQueue(next)
    setJobs(next)
    delete pollCountsRef.current[queueId]
  }

  function clearCompleted() {
    const next = jobsRef.current.filter(j => j.status === 'running')
    saveQueue(next)
    setJobs(next)
  }

  return { jobs, enqueue, cancelJob, dismissJob, clearCompleted, enqueueError }
}
