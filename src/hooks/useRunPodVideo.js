import { useState, useRef, useCallback } from 'react'
import { loadSettings, loadVideoSettings, loadS3Settings } from '../utils/storage'
import { saveImage } from '../utils/imageStore'
import logger from '../utils/logger'

const RUNPOD_BASE = 'https://api.runpod.ai/v2'
const SERVER = 'http://localhost:3001'
const POLL_INTERVAL_MS = 3000
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])

// Returns { type, ...fields } or null.
// type 'video_url'  — hosted video, fields: { url }
// type 'video_b64'  — base64 video data, fields: { data, filename }
// type 'image_b64'  — base64 image frame(s), fields: { data, filename }
function extractOutput(output) {
  if (!output) return null

  // S3 / hosted URL variants
  if (output.videos?.[0]?.url)  return { type: 'video_url', url: output.videos[0].url }
  if (output.video_url)          return { type: 'video_url', url: output.video_url }
  if (output.url)                return { type: 'video_url', url: output.url }
  if (output.files?.[0]?.url)   return { type: 'video_url', url: output.files[0].url }
  if (Array.isArray(output) && typeof output[0] === 'string' && output[0].startsWith('http'))
    return { type: 'video_url', url: output[0] }

  // worker-comfyui standard images array (S3 url or base64)
  const imgs = Array.isArray(output.images) ? output.images : []
  if (imgs.length > 0) {
    const first = imgs[0]
    if (first.url?.startsWith('http')) return { type: 'video_url', url: first.url }
    if (first.url?.startsWith('data:video')) return { type: 'video_b64', data: first.url, filename: first.filename ?? 'output.mp4' }
    if (first.image) {
      const data = first.image.startsWith('data:') ? first.image : `data:image/png;base64,${first.image}`
      return { type: 'image_b64', data, filename: first.filename ?? 'frame.png' }
    }
  }

  // base64 video directly in output
  if (typeof output === 'string' && output.startsWith('data:video'))
    return { type: 'video_b64', data: output, filename: 'output.mp4' }

  return null
}

export function useRunPodVideo() {
  const [status, setStatus]             = useState('idle')
  const [progress, setProgress]         = useState({ value: 0, max: 0 })
  const [outputs, setOutputs]           = useState([])
  const [errorMessage, setErrorMessage] = useState(null)

  const intervalRef = useRef(null)

  function clearPoll() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // images: array of { name, image } where image is a base64 data URL
  const submit = useCallback(async (filledWorkflow, project = '', workflowName = '', fieldValues = {}, images = []) => {
    setStatus('connecting')
    setOutputs([])
    setErrorMessage(null)
    setProgress({ value: 0, max: 0 })
    clearPoll()

    const { apiKey } = loadSettings()
    const { endpointId } = loadVideoSettings()

    if (!apiKey) {
      setStatus('failed')
      setErrorMessage('No API key set. Open Settings (header) and enter your RunPod API key.')
      return
    }
    if (!endpointId) {
      setStatus('failed')
      setErrorMessage('No video endpoint ID set. Click Settings above and enter your RunPod video endpoint ID.')
      return
    }

    let jobId
    try {
      const res = await fetch(`${RUNPOD_BASE}/${endpointId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: { workflow: filledWorkflow, images } }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status} — ${text}`)
      }
      const data = await res.json()
      jobId = data.id
      if (!jobId) throw new Error('No job ID returned from RunPod.')
    } catch (err) {
      setStatus('failed')
      setErrorMessage(`Submit failed: ${err.message}`)
      return
    }

    setStatus('generating')
    let pollCount = 0

    intervalRef.current = setInterval(async () => {
      pollCount++
      setProgress({ value: pollCount, max: 0 })

      try {
        const res = await fetch(`${RUNPOD_BASE}/${endpointId}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`)
        const data = await res.json()

        if (!TERMINAL.has(data.status)) return

        clearPoll()

        if (data.status !== 'COMPLETED') {
          setStatus('failed')
          setErrorMessage(`Job ${data.status.toLowerCase()}. ${data.error ?? ''}`.trim())
          return
        }

        logger.info('useRunPodVideo', 'Raw output', data.output)

        const result = extractOutput(data.output)

        // S3 fallback: list objects under {MM-YY}/{jobId}/ when RunPod returns no usable output
        if (!result) {
          const s3 = loadS3Settings()
          let s3Results = []
          if (s3.bucket && s3.region && s3.keyId && s3.secret && s3.cfBaseUrl) {
            try {
              const s3Res = await fetch(`${SERVER}/api/s3-outputs`, {
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
              if (s3Res.ok) s3Results = await s3Res.json()
            } catch (e) {
              logger.warn('useRunPodVideo', 'S3 listing failed', e.message)
            }
          }

          if (s3Results.length === 0) {
            setStatus('failed')
            setErrorMessage(
              'Job completed but no video found in RunPod output or S3. ' +
              'Check the browser console for the raw output, and verify your S3 settings.'
            )
            return
          }

          const nowMs = Date.now()
          const records = s3Results.map((item, i) => ({
            id:           `rp_video_${nowMs}_${jobId}_${i}`,
            timestamp:    nowMs,
            project, workflowName, fieldValues,
            mediaType:    'video',
            mediaUrl:     item.url,
            displayUrl:   item.url,
            filename:     item.filename,
            imageData:    null,
            rating:       null,
          }))

          await Promise.all(records.map(r => saveImage(r).catch(e => logger.warn('useRunPodVideo', 'IndexedDB save failed', e))))
          setOutputs(records)
          setStatus('completed')
          return
        }

        const now = Date.now()
        const id  = `rp_video_${now}_${jobId}`
        let record

        if (result.type === 'video_url') {
          record = {
            id, timestamp: now, project, workflowName, fieldValues,
            mediaType: 'video',
            mediaUrl: result.url, displayUrl: result.url,
            filename: result.url.split('/').pop().split('?')[0],
            imageData: null, rating: null,
          }
        } else if (result.type === 'video_b64') {
          let mediaUrl = null
          try {
            const saveRes = await fetch(`${SERVER}/api/save-media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, mediaData: result.data, filename: result.filename, metadata: { project } }),
            })
            if (saveRes.ok) mediaUrl = (await saveRes.json()).url
          } catch (e) { logger.warn('useRunPodVideo', 'Failed to save video to server', e.message) }
          record = {
            id, timestamp: now, project, workflowName, fieldValues,
            mediaType: 'video',
            mediaUrl, displayUrl: mediaUrl ? `${SERVER}${mediaUrl}` : result.data,
            filename: result.filename, imageData: null, rating: null,
          }
        } else {
          // image_b64 — frames returned by SaveImage node
          try {
            await fetch(`${SERVER}/api/save-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, imageData: result.data, metadata: { project, filename: result.filename } }),
            })
          } catch (e) { logger.warn('useRunPodVideo', 'Failed to save frame to server', e.message) }
          record = {
            id, timestamp: now, project, workflowName, fieldValues,
            mediaType: 'image',
            mediaUrl: null, displayUrl: null,
            imageData: result.data, filename: result.filename, rating: null,
          }
        }

        await saveImage(record).catch(e => logger.warn('useRunPodVideo', 'IndexedDB save failed', e))
        setOutputs([record])
        setStatus('completed')
      } catch (err) {
        logger.error('useRunPodVideo', 'Poll error', err)
      }
    }, POLL_INTERVAL_MS)
  }, [])

  function reset() {
    clearPoll()
    setStatus('idle')
    setOutputs([])
    setErrorMessage(null)
    setProgress({ value: 0, max: 0 })
  }

  return { submit, status, progress, outputs, errorMessage, reset }
}
