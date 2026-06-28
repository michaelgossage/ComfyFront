import { getAllImages } from './imageStore'

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime()
}

function startOfWeek() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export async function computeStats() {
  const records  = await getAllImages()
  const dayStart = startOfToday()
  const wkStart  = startOfWeek()

  const rated    = records.filter(r => r.rating === 'yes' || r.rating === 'no')
  const positive = records.filter(r => r.rating === 'yes')

  const failed = records.filter(r => r.mediaType === 'failed')

  const wfMap = new Map()
  for (const r of records) {
    const name = r.workflowName || r.checkpoint || 'Unknown'
    if (!wfMap.has(name)) wfMap.set(name, { name, count: 0, failCount: 0, durations: [], pos: 0, rated: 0 })
    const wf = wfMap.get(name)
    wf.count++
    if (r.mediaType === 'failed') wf.failCount++
    if (r.durationMs != null) wf.durations.push(r.durationMs)
    if (r.rating === 'yes') wf.pos++
    if (r.rating === 'yes' || r.rating === 'no') wf.rated++
  }

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  const byWorkflow = [...wfMap.values()]
    .map(wf => ({
      name:          wf.name,
      count:         wf.count,
      failCount:     wf.failCount,
      avgDurationMs: avg(wf.durations),
      minDurationMs: wf.durations.length ? Math.min(...wf.durations) : null,
      maxDurationMs: wf.durations.length ? Math.max(...wf.durations) : null,
      positiveCount: wf.pos,
      positiveRate:  wf.rated ? Math.round(100 * wf.pos / wf.rated) : null,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    total:         records.length,
    failedCount:   failed.length,
    todayCount:    records.filter(r => r.timestamp >= dayStart).length,
    weekCount:     records.filter(r => r.timestamp >= wkStart).length,
    positiveCount: positive.length,
    positiveRate:  rated.length ? Math.round(100 * positive.length / rated.length) : null,
    byWorkflow,
    topRated:      [...positive].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    allRuns:       [...records].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
  }
}
