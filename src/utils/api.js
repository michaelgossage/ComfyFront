const SERVER_URL = 'http://localhost:3001'

// Saves a generated image to the local server.
// record: full image record from imageStore (id, imageData, project, prompt, etc.)
// Returns { ok, path } on success, throws on failure.
export async function saveImageToServer(record) {
  const { id, imageData, ...metadata } = record
  const res = await fetch(`${SERVER_URL}/api/save-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, imageData, metadata }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json()
}
