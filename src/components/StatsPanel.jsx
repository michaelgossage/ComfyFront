import { useState, useEffect } from 'react'
import { computeStats } from '../utils/stats'

function formatDuration(ms) {
  if (ms == null) return '—'
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function prettifyKey(k) {
  const key = k.includes('::') ? k.split('::').pop() : k
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function StatusBadge({ record }) {
  if (record.mediaType === 'failed') return <span className="run-badge run-badge--fail" title={record.errorMessage}>✕</span>
  if (record.rating === 'yes')       return <span className="run-rating run-rating--yes">👍</span>
  if (record.rating === 'no')        return <span className="run-rating run-rating--no">👎</span>
  return null
}

function RunRow({ record }) {
  const [open, setOpen] = useState(false)
  const chips = Object.entries(record.fieldValues ?? {})
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => ({ label: prettifyKey(k), value: String(v) }))
  // also surface flat params (useRunPod image hook stores prompt, seed, etc. directly)
  const flatParams = ['prompt', 'seed', 'steps', 'cfg', 'width', 'height', 'checkpoint']
    .filter(k => record[k] != null && record[k] !== '')
    .map(k => ({ label: prettifyKey(k), value: String(record[k]) }))
  const allFields = chips.length > 0 ? chips : flatParams

  const canExpand = allFields.length > 0 || (record.mediaType === 'failed' && record.errorMessage)

  return (
    <div className="run-row">
      <div className="run-row-main" onClick={() => canExpand && setOpen(o => !o)}>
        <span className="run-workflow">{record.workflowName || record.checkpoint || 'Unknown'}</span>
        <span className="run-duration">{formatDuration(record.durationMs)}</span>
        <span className="run-date">{formatDate(record.timestamp)}</span>
        <StatusBadge record={record} />
        {canExpand && (
          <span className="run-expand">{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && (
        <div className="run-fields">
          {record.mediaType === 'failed' && record.errorMessage && (
            <div className="run-field-row" style={{ marginBottom: '0.25rem' }}>
              <span className="run-field-key" style={{ color: 'var(--error-text)' }}>Error</span>
              <span className="run-field-val" style={{ color: 'var(--error-text)' }}>{record.errorMessage}</span>
            </div>
          )}
          {allFields.map(({ label, value }) => (
            <div key={label} className="run-field-row">
              <span className="run-field-key">{label}</span>
              <span className="run-field-val">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

const PAGE_SIZE = 30

export default function StatsPanel() {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)

  function reload() {
    setLoading(true)
    setPage(1)
    computeStats()
      .then(s => { setStats(s); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  if (loading) {
    return <div className="status-area" style={{ minHeight: 200 }}><div className="spinner" /><p>Loading…</p></div>
  }

  if (!stats || stats.total === 0) {
    return <div className="status-area" style={{ minHeight: 200 }}><p className="placeholder-text">No generations recorded yet.</p></div>
  }

  const visibleRuns = stats.allRuns.slice(0, page * PAGE_SIZE)
  const hasMore     = visibleRuns.length < stats.allRuns.length

  return (
    <div className="stats-panel">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className="btn-secondary btn-small" onClick={reload}>Refresh</button>
      </div>

      {/* Summary */}
      <div className="stat-cards">
        <SummaryCard label="Total" value={stats.total} />
        <SummaryCard label="Today" value={stats.todayCount} />
        <SummaryCard label="Failed" value={stats.failedCount} />
        <SummaryCard label="👍 Rate" value={stats.positiveRate != null ? `${stats.positiveRate}%` : '—'} />
      </div>

      {/* Run log */}
      <section className="stats-section">
        <h3 className="stats-heading">All Runs</h3>
        <div className="run-log">
          <div className="run-log-header">
            <span>Workflow</span>
            <span>Time</span>
            <span>Date</span>
            <span />
            <span />
          </div>
          {visibleRuns.map(r => <RunRow key={r.id} record={r} />)}
        </div>
        {hasMore && (
          <button
            className="btn-secondary btn-small"
            style={{ marginTop: '0.5rem', width: '100%' }}
            onClick={() => setPage(p => p + 1)}
          >
            Show more ({stats.allRuns.length - visibleRuns.length} remaining)
          </button>
        )}
      </section>

      {/* Workflow breakdown */}
      {stats.byWorkflow.length > 0 && (
        <section className="stats-section">
          <h3 className="stats-heading">By Workflow</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="stats-table">
              <thead>
                <tr><th>Workflow</th><th>Runs</th><th>Failed</th><th>Avg</th><th>Fastest</th><th>Slowest</th><th>👍%</th></tr>
              </thead>
              <tbody>
                {stats.byWorkflow.map(wf => (
                  <tr key={wf.name}>
                    <td className="stats-name-cell" title={wf.name}>{wf.name}</td>
                    <td>{wf.count}</td>
                    <td style={{ color: wf.failCount > 0 ? 'var(--error-text)' : 'var(--text-muted)' }}>{wf.failCount}</td>
                    <td>{formatDuration(wf.avgDurationMs)}</td>
                    <td>{formatDuration(wf.minDurationMs)}</td>
                    <td>{formatDuration(wf.maxDurationMs)}</td>
                    <td>{wf.positiveRate != null ? `${wf.positiveRate}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
