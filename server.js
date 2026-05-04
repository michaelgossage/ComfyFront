import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

const app = express()
const PORT = process.env.SERVER_PORT ?? 3001
const IMAGES_DIR = process.env.IMAGES_DIR ?? './saved-images'
const WORKFLOWS_DIR = './workflows'

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '200mb' }))

// Ensure the images directory exists on startup
await fs.mkdir(IMAGES_DIR, { recursive: true })

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

// GET /api/health
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`ComfyFront server running on http://localhost:${PORT}`)
  console.log(`Images will be saved to: ${path.resolve(IMAGES_DIR)}`)
})
