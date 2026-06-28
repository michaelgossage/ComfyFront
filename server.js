import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const app = express()
const PORT = process.env.SERVER_PORT ?? 3001
const IMAGES_DIR = process.env.IMAGES_DIR ?? './saved-images'
const WORKFLOWS_DIR = './workflows'
const BATCHES_DIR = './batches'
const BATCHES_FILE = `${BATCHES_DIR}/records.json`

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '200mb' }))

// Ensure required directories exist on startup
await fs.mkdir(IMAGES_DIR, { recursive: true })
await fs.mkdir(BATCHES_DIR, { recursive: true })

// POST /api/save-image
// Body: { id, imageData (base64 data URL), metadata (object) }
// Writes {id}.png and {id}.json into IMAGES_DIR
app.post('/api/save-image', async (req, res) => {
  const { id, imageData, metadata } = req.body

  if (!id || !imageData) {
    return res.status(400).json({ error: 'id and imageData are required' })
  }

  try {
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    const imgPath  = path.join(IMAGES_DIR, `${id}.png`)
    const metaPath = path.join(IMAGES_DIR, `${id}.json`)

    await Promise.all([
      fs.writeFile(imgPath, buffer),
      fs.writeFile(metaPath, JSON.stringify(metadata ?? {}, null, 2)),
    ])

    console.log(`[save-image] Saved ${id}.png`)
    res.json({ ok: true, path: imgPath })
  } catch (err) {
    console.error('[save-image] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/save-media
// Body: { id, mediaData (base64 data URL or raw base64), filename, metadata }
// Writes the media file and {id}.json into IMAGES_DIR
app.post('/api/save-media', async (req, res) => {
  const { id, mediaData, filename, metadata } = req.body

  if (!id || !mediaData || !filename) {
    return res.status(400).json({ error: 'id, mediaData, and filename are required' })
  }

  try {
    const ext = path.extname(filename) || '.mp4'
    // Strip any data URL prefix (e.g. data:video/mp4;base64,)
    const base64 = mediaData.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    const mediaPath = path.join(IMAGES_DIR, `${id}${ext}`)
    const metaPath  = path.join(IMAGES_DIR, `${id}.json`)

    await Promise.all([
      fs.writeFile(mediaPath, buffer),
      fs.writeFile(metaPath, JSON.stringify(metadata ?? {}, null, 2)),
    ])

    console.log(`[save-media] Saved ${id}${ext}`)
    res.json({ ok: true, url: `/media/${id}${ext}` })
  } catch (err) {
    console.error('[save-media] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /media/:filename
// Serves media files from IMAGES_DIR with correct Content-Type.
// Express's sendFile handles Range requests automatically, enabling video seeking.
app.get('/media/:filename', (req, res) => {
  const filename = path.basename(req.params.filename) // prevent path traversal
  const filePath = path.resolve(IMAGES_DIR, filename)

  if (!fsSync.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }

  res.sendFile(filePath)
})

// GET /api/workflows
// Returns a list of workflow names from the workflows/ directory
app.get('/api/workflows', async (_req, res) => {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true })
    const files = await fs.readdir(WORKFLOWS_DIR)
    const names = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
    res.json(names)
  } catch (err) {
    console.error('[workflows] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/workflows/:name
// Returns the parsed JSON of workflows/{name}.json
app.get('/api/workflows/:name', async (req, res) => {
  const name = path.basename(req.params.name) // prevent path traversal
  const filePath = path.join(WORKFLOWS_DIR, `${name}.json`)

  try {
    const content = await fs.readFile(filePath, 'utf8')
    res.json(JSON.parse(content))
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: `Workflow "${name}" not found` })
    }
    console.error('[workflows] Error reading workflow:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/s3-outputs
// Body: { jobId?, bucket, region, keyId, secret, cloudfrontBase, endpointUrl? }
// jobId present → lists {MM-YY}/{jobId}/ (specific job)
// jobId absent  → lists {MM-YY}/        (all videos this month)
// endpointUrl   → use for Cloudflare R2 or other S3-compatible stores
// Returns [{ url, filename, lastModified }]. Credentials never stored server-side.
app.post('/api/s3-outputs', async (req, res) => {
  const { jobId, bucket, region, keyId, secret, cloudfrontBase, endpointUrl } = req.body

  if (!bucket || !region || !keyId || !secret || !cloudfrontBase) {
    return res.json([])
  }

  try {
    const clientConfig = {
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }
    if (endpointUrl) {
      clientConfig.endpoint = endpointUrl
      clientConfig.forcePathStyle = true
    }
    const client = new S3Client(clientConfig)

    const now    = new Date()
    const mm     = String(now.getMonth() + 1).padStart(2, '0')
    const yy     = String(now.getFullYear()).slice(-2)
    const prefix = jobId ? `${mm}-${yy}/${jobId}/` : `${mm}-${yy}/`

    const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])
    const base = cloudfrontBase.replace(/\/$/, '')
    const results = []

    // Paginate in case there are many objects
    let continuationToken
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
      const data = await client.send(command)
      for (const obj of data.Contents ?? []) {
        if (VIDEO_EXTS.has(path.extname(obj.Key).toLowerCase())) {
          results.push({
            url:          `${base}/${obj.Key}`,
            filename:     path.basename(obj.Key),
            lastModified: obj.LastModified?.toISOString() ?? null,
          })
        }
      }
      continuationToken = data.NextContinuationToken
    } while (continuationToken)

    // Newest first
    results.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))

    console.log(`[s3-outputs] prefix=${prefix} found=${results.length}`)
    res.json(results)
  } catch (err) {
    console.error('[s3-outputs] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/batch-record
// Body: { batchId, workflowName, imageCount, runsPerImage, totalJobs, jobIds, submittedAt }
// Appends a batch manifest entry to batches/records.json
app.post('/api/batch-record', async (req, res) => {
  const { batchId, workflowName, imageCount, runsPerImage, totalJobs, jobIds, submittedAt } = req.body
  if (!batchId || !workflowName) return res.status(400).json({ error: 'batchId and workflowName are required' })

  try {
    let records = []
    try {
      const content = await fs.readFile(BATCHES_FILE, 'utf8')
      records = JSON.parse(content)
    } catch {
      // File doesn't exist yet — start fresh
    }
    records.push({ batchId, workflowName, imageCount, runsPerImage, totalJobs, jobIds: jobIds ?? [], submittedAt })
    await fs.writeFile(BATCHES_FILE, JSON.stringify(records, null, 2))
    console.log(`[batch-record] Saved batch ${batchId} (${totalJobs} jobs)`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[batch-record] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/batch-records
// Returns all persisted batch manifests
app.get('/api/batch-records', async (_req, res) => {
  try {
    const content = await fs.readFile(BATCHES_FILE, 'utf8')
    res.json(JSON.parse(content))
  } catch {
    res.json([])
  }
})

// GET /api/health
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`ComfyFront server running on http://localhost:${PORT}`)
  console.log(`Images will be saved to: ${path.resolve(IMAGES_DIR)}`)
})
