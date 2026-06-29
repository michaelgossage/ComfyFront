import { useState } from 'react'
import { loadSettings, loadVideoSettings } from '../utils/storage'
import { fillWorkflow, parseWorkflow } from '../utils/workflowParser'

const RUNPOD_BASE = 'https://api.runpod.ai/v2'
const SERVER = 'http://localhost:3001'
const SUBMIT_DELAY_MS = 250

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Returns all seed-like fields — matches KSampler/RandomNoise via isSeed flag,
// and PrimitiveInt "Seed" nodes (common in LTX workflows) via label.
function findSeedFields(workflow) {
  return parseWorkflow(workflow).filter(
    f => f.isSeed || f.label.toLowerCase().includes('seed')
  )
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useBatchSubmit() {
  const [status, setStatus]     = useState('idle')   // idle | submitting | done | error
  const [submitted, setSubmitted] = useState(0)
  const [total, setTotal]         = useState(0)
  const [errorMsg, setErrorMsg]   = useState(null)
  const [jobIds, setJobIds]       = useState([])

  async function submitBatch({ imageFiles, workflow, workflowName, runsPerImage, fieldValues, randomizeSeed = true }) {
    setStatus('submitting')
    setSubmitted(0)
    setJobIds([])
    setErrorMsg(null)

    const { apiKey }     = loadSettings()
    const { endpointId } = loadVideoSettings()

    if (!apiKey)     { setErrorMsg('No API key set in Settings.'); setStatus('error'); return }
    if (!endpointId) { setErrorMsg('No video endpoint ID set in Settings.'); setStatus('error'); return }
    if (!imageFiles?.length) { setErrorMsg('No images selected.'); setStatus('error'); return }

    const seedFields = randomizeSeed ? findSeedFields(workflow) : []
    const totalJobs = imageFiles.length * runsPerImage
    setTotal(totalJobs)

    const allJobIds = []
    let submitCount = 0

    for (const file of imageFiles) {
      let base64
      try {
        base64 = await fileToBase64(file)
      } catch {
        setErrorMsg(`Failed to read file: ${file.name}`)
        setStatus('error')
        return
      }

      // Parse image fields once per image file (same workflow, same nodes)
      const imageFields = parseWorkflow(workflow).filter(f => f.type === 'image')

      for (let run = 0; run < runsPerImage; run++) {
        const runValues = { ...fieldValues }

        // Inject this file's name into every LoadImage node so the worker can match it
        for (const field of imageFields) {
          runValues[`${field.nodeId}::${field.key}`] = file.name
        }

        for (const field of seedFields) {
          runValues[`${field.nodeId}::${field.key}`] = randomSeed()
        }

        const filledWorkflow = fillWorkflow(workflow, runValues)

        let jobId
        try {
          const res = await fetch(`${RUNPOD_BASE}/${endpointId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              input: {
                workflow: filledWorkflow,
                images: [{ name: file.name, image: base64 }],
              },
            }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`)
          const data = await res.json()
          jobId = data.id
          if (!jobId) throw new Error('No job ID returned from RunPod.')
        } catch (err) {
          setErrorMsg(`Submit failed on ${file.name} run ${run + 1}: ${err.message}`)
          setStatus('error')
          return
        }

        allJobIds.push(jobId)
        submitCount++
        setSubmitted(submitCount)
        setJobIds(prev => [...prev, jobId])

        if (submitCount < totalJobs) await delay(SUBMIT_DELAY_MS)
      }
    }

    // Persist batch record to server (best-effort)
    try {
      await fetch(`${SERVER}/api/batch-record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId:      crypto.randomUUID(),
          workflowName,
          imageCount:   imageFiles.length,
          runsPerImage,
          totalJobs,
          jobIds:       allJobIds,
          submittedAt:  new Date().toISOString(),
        }),
      })
    } catch {
      // Server may not be running — not critical
    }

    setStatus('done')
  }

  function reset() {
    setStatus('idle')
    setSubmitted(0)
    setTotal(0)
    setJobIds([])
    setErrorMsg(null)
  }

  return { submitBatch, status, submitted, total, jobIds, errorMsg, reset }
}
