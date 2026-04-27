import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'

const app = express()
const PORT = process.env.SERVER_PORT ?? 3001
const IMAGES_DIR = process.env.IMAGES_DIR ?? './saved-images'

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '50mb' }))

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
    // Strip the data URL prefix to get raw base64
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

// GET /api/health
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`ComfyFront server running on http://localhost:${PORT}`)
  console.log(`Images will be saved to: ${path.resolve(IMAGES_DIR)}`)
})
