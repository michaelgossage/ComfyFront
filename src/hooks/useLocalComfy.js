import { useState, useRef, useEffect, useCallback } from 'react'
import { loadLocalSettings } from '../utils/storage'
import { saveImage } from '../utils/imageStore'
import logger from '../utils/logger'

const SERVER = 'http://localhost:3001'
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.gif', '.mov'])

function getExt(filename) {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

function isVideo(filename) {
  return VIDEO_EXTS.has(getExt(filename))
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function useLocalComfy() {
  const [status, setStatus]           = useState('idle')
  const [progress, setProgress]       = useState({ value: 0, max: 0 })
  const [outputs, setOutputs]         = useState([])
  const [errorMessage, setErrorMessage] = useState(null)

  const wsRef        = useRef(null)
  const projectRef   = useRef('')

  useEffect(() => {
    return () => wsRef.current?.close()
  }, [])

  // Upload an image file to ComfyUI and return the filename it assigns
  const uploadImage = useCallback(async (file) => {
    const { host, port } = loadLocalSettings()
    const form = new FormData()
    form.append('image', file)
    form.append('overwrite', 'true')

    const res = await fetch(`http://${host}:${port}/api/upload/image`, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`)
    const data = await res.json()
    return data.name
  }, [])

  const submit = useCallback(async (filledWorkflow, project = '', workflowName = '', fieldValues = {}) => {
    setStatus('connecting')
    setOutputs([])
    setErrorMessage(null)
    setProgress({ value: 0, max: 0 })
    projectRef.current = project

    const submittedAt = Date.now()

    const { host, port } = loadLocalSettings()
    const baseUrl = `http://${host}:${port}`
    const wsUrl   = `ws://${host}:${port}/ws`
    const clientId = crypto.randomUUID()

    // Submit the prompt first, then listen on WebSocket for progress
    let promptId
    try {
      const res = await fetch(`${baseUrl}/api/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: filledWorkflow, client_id: clientId }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status} — ${text}`)
      }
      const data = await res.json()
      promptId = data.prompt_id
    } catch (err) {
      setStatus('failed')
      setErrorMessage(
        err.message.includes('Failed to fetch')
          ? `Could not reach ComfyUI at ${host}:${port}. Check it is running.`
          : `Submit failed: ${err.message}`
      )
      return
    }

    setStatus('generating')

    wsRef.current?.close()
    const ws = new WebSocket(`${wsUrl}?clientId=${clientId}`)
    wsRef.current = ws

    ws.onmessage = async (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }

      if (msg.type === 'progress') {
        setProgress({ value: msg.data.value, max: msg.data.max })
      }

      if (msg.type === 'executing' && msg.data.node === null) {
        // Generation complete — fetch outputs from history
        ws.close()
        setStatus('fetching')

        try {
          const histRes = await fetch(`${baseUrl}/api/history/${promptId}`)
          if (!histRes.ok) throw new Error(`History fetch failed: HTTP ${histRes.status}`)
          const history = await histRes.json()
          const outputNodes = history[promptId]?.outputs ?? {}

          const records    = []
          const now        = Date.now()
          const durationMs = now - submittedAt

          for (const nodeOutputs of Object.values(outputNodes)) {
            const files = [...(nodeOutputs.images ?? []), ...(nodeOutputs.videos ?? []), ...(nodeOutputs.gifs ?? [])]
            for (const file of files) {
              const { filename, subfolder, type } = file
              const viewUrl = `${baseUrl}/api/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder ?? '')}&type=${type ?? 'output'}`
              const blob = await fetch(viewUrl).then(r => r.blob())
              const ext  = getExt(filename)
              const id   = `local_${now}_${filename}`

              if (isVideo(filename)) {
                // Videos go to disk — too large for IndexedDB
                const base64 = await blobToBase64(blob)
                let mediaUrl = null
                try {
                  const saveRes = await fetch(`${SERVER}/api/save-media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, mediaData: base64, filename, metadata: { project, filename } }),
                  })
                  if (saveRes.ok) {
                    const saved = await saveRes.json()
                    mediaUrl = saved.url
                  }
                } catch (e) {
                  logger.warn('useLocalComfy', 'Failed to save video to server', e.message)
                }

                // Fall back to object URL if server save failed
                const displayUrl = mediaUrl
                  ? `${SERVER}${mediaUrl}`
                  : URL.createObjectURL(blob)

                const record = {
                  id, timestamp: now, project,
                  workflowName, fieldValues,
                  mediaType: ext === '.gif' ? 'gif' : 'video',
                  mediaUrl: mediaUrl ?? null,
                  displayUrl,
                  filename,
                  imageData: null,
                  rating: null,
                  submittedAt, durationMs,
                }
                await saveImage(record).catch(e => logger.warn('useLocalComfy', 'IndexedDB save failed', e))
                records.push(record)
              } else {
                // Images stored as base64 in IndexedDB
                const dataUrl = await blobToBase64(blob)
                const record = {
                  id, timestamp: now, project,
                  workflowName, fieldValues,
                  mediaType: 'image',
                  mediaUrl: null,
                  imageData: dataUrl,
                  filename,
                  rating: null,
                  submittedAt, durationMs,
                }
                // Also save to disk
                fetch(`${SERVER}/api/save-image`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, imageData: dataUrl, metadata: { project, filename } }),
                }).catch(e => logger.warn('useLocalComfy', 'Failed to save image to server', e.message))

                await saveImage(record).catch(e => logger.warn('useLocalComfy', 'IndexedDB save failed', e))
                records.push(record)
              }
            }
          }

          setOutputs(records)
          setStatus('completed')
        } catch (err) {
          logger.error('useLocalComfy', 'Output fetch error', err)
          setStatus('failed')
          setErrorMessage(`Failed to fetch outputs: ${err.message}`)
        }
      }
    }

    ws.onerror = () => {
      setStatus('failed')
      setErrorMessage(`WebSocket error connecting to ${host}:${port}.`)
    }

    ws.onclose = (e) => {
      if (status === 'generating' && !e.wasClean) {
        setStatus('failed')
        setErrorMessage('Connection to ComfyUI lost during generation.')
      }
    }
  }, [])

  function reset() {
    wsRef.current?.close()
    setStatus('idle')
    setOutputs([])
    setErrorMessage(null)
    setProgress({ value: 0, max: 0 })
  }

  return { submit, uploadImage, status, progress, outputs, errorMessage, reset }
}
