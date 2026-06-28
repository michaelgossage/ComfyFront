import { useState, useRef, useEffect, useCallback } from 'react'
import { loadSettings } from '../utils/storage'
import { buildWorkflow } from '../utils/workflow'
import { saveImage } from '../utils/imageStore'
import { saveImageToServer } from '../utils/api'
import logger from '../utils/logger'

const RUNPOD_BASE = 'https://api.runpod.ai/v2'
const POLL_INTERVAL_MS = 2000
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])

export function useRunPod() {
  const [status, setStatus] = useState('idle')
  const [jobId, setJobId] = useState(null)
  const [images, setImages] = useState([])
  const [errorMessage, setErrorMessage] = useState(null)

  // Refs so interval callbacks always read current values without stale closures
  const intervalRef  = useRef(null)
  const jobIdRef     = useRef(null)
  const settingsRef  = useRef({ apiKey: '', endpointId: '' })
  const paramsRef    = useRef(null)
  const projectRef   = useRef('')

  useEffect(() => {
    return () => clearInterval(intervalRef.current)
  }, [])

  function stopPolling() {
    clearInterval(intervalRef.current)
    intervalRef.current = null
  }

  async function pollStatus(submittedAt = 0, pollCount = 0) {
    const { apiKey, endpointId } = settingsRef.current
    const currentJobId = jobIdRef.current
    if (!currentJobId) return

    try {
      const res = await fetch(`${RUNPOD_BASE}/${endpointId}/status/${currentJobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })

      if (!res.ok) {
        stopPolling()
        setStatus('failed')
        setErrorMessage(`Status check failed: HTTP ${res.status}`)
        return
      }

      const data = await res.json()
      logger.debug('useRunPod', 'Poll response', { jobId: currentJobId, status: data.status })

      if (!TERMINAL_STATUSES.has(data.status)) return

      // Guard against two in-flight polls both seeing a terminal status
      if (!intervalRef.current) return
      stopPolling()
      logger.info('useRunPod', 'Job reached terminal status', { jobId: currentJobId, status: data.status })

      if (data.status === 'COMPLETED') {
        const outputImages = data.output?.images ?? []
        const dataUrls = outputImages.map((img) => `data:image/png;base64,${img.data}`)
        setImages(dataUrls)

        const now        = Date.now()
        const durationMs = submittedAt ? now - submittedAt : undefined
        await Promise.all(dataUrls.map((imageData, i) => {
          const record = {
            id:          `${now}_${currentJobId}_${i}`,
            jobId:       currentJobId,
            timestamp:   now,
            project:     projectRef.current,
            imageData,
            ...paramsRef.current,
            rating:      null,
            submittedAt,
            durationMs,
            pollCount,
          }
          saveImageToServer(record)
            .then(({ path }) => logger.info('useRunPod', 'Image saved to disk', { path }))
            .catch((err) => logger.warn('useRunPod', 'Failed to save image to server (is it running?)', err.message))
          return saveImage(record)
            .catch((err) => logger.error('useRunPod', 'Failed to save image to IndexedDB', err))
        }))

        // Set completed after IndexedDB saves so App's refresh sees the new images
        setStatus('completed')
      } else {
        setStatus('failed')
        setErrorMessage(`Job ${data.status.toLowerCase()}. Check your RunPod endpoint logs.`)
      }
    } catch (err) {
      stopPolling()
      setStatus('failed')
      setErrorMessage(`Network error while polling: ${err.message}`)
      logger.error('useRunPod', 'Poll error', err)
    }
  }

  const submit = useCallback(async (params, project = '') => {
    setStatus('submitting')
    setImages([])
    setErrorMessage(null)
    setJobId(null)
    jobIdRef.current  = null
    paramsRef.current = params
    projectRef.current = project

    const submittedAt = Date.now()
    let pollCount = 0

    logger.info('useRunPod', 'Submitting job', { project, ...params })

    const settings = loadSettings()
    settingsRef.current = settings

    if (!settings.apiKey || !settings.endpointId) {
      setStatus('failed')
      setErrorMessage('Configure your API key and endpoint ID in Settings before generating.')
      return
    }

    try {
      const res = await fetch(`${RUNPOD_BASE}/${settings.endpointId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ input: { workflow: buildWorkflow(params) } }),
      })

      if (!res.ok) {
        const text = await res.text()
        setStatus('failed')
        setErrorMessage(`Submit failed: HTTP ${res.status} — ${text}`)
        logger.error('useRunPod', 'Submit failed', { status: res.status, body: text })
        return
      }

      const data = await res.json()
      jobIdRef.current = data.id
      setJobId(data.id)
      setStatus('polling')
      logger.info('useRunPod', 'Job submitted', { jobId: data.id })

      intervalRef.current = setInterval(async () => {
        pollCount++
        await pollStatus(submittedAt, pollCount)
      }, POLL_INTERVAL_MS)
    } catch (err) {
      setStatus('failed')
      setErrorMessage(`Network error: ${err.message}`)
      logger.error('useRunPod', 'Submit network error', err)
    }
  }, [])

  function reset() {
    stopPolling()
    setStatus('idle')
    setJobId(null)
    setImages([])
    setErrorMessage(null)
    jobIdRef.current = null
    paramsRef.current = null
    projectRef.current = ''
  }

  return { submit, status, jobId, images, errorMessage, reset }
}
