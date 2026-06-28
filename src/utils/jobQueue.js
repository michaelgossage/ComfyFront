const QUEUE_KEY    = 'comfyfront_video_queue'
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function loadQueue() {
  try {
    const entries = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    const cutoff  = Date.now() - PRUNE_AGE_MS
    const pruned  = entries.filter(e =>
      e.status === 'running' || (e.submittedAt && e.submittedAt > cutoff)
    )
    if (pruned.length !== entries.length) saveQueue(pruned)
    return pruned
  } catch {
    return []
  }
}

export function saveQueue(entries) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(entries))
}

export function addJob(entry) {
  const entries = loadQueue()
  entries.push(entry)
  saveQueue(entries)
}

export function updateJob(queueId, updates) {
  const entries = loadQueue()
  const idx = entries.findIndex(e => e.queueId === queueId)
  if (idx !== -1) {
    entries[idx] = { ...entries[idx], ...updates }
    saveQueue(entries)
  }
}

export function getRunningJobs() {
  return loadQueue().filter(e => e.status === 'running')
}
