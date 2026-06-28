import { useState } from 'react'
import SettingsClient from './components/SettingsClient'
import RunPodVideoTab from './components/RunPodVideoTab'
import { loadSettings } from './utils/storage'
import { clientWorkflows } from './clientWorkflows'

export default function AppClient() {
  const [settingsOpen, setSettingsOpen] = useState(() => {
    // Auto-open on first visit if no API key is configured
    const { apiKey } = loadSettings()
    return !apiKey
  })

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">ComfyFront</h1>
        <div className="header-controls">
          <button className="btn-secondary" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {settingsOpen && <SettingsClient onClose={() => setSettingsOpen(false)} />}

      <RunPodVideoTab
        project=""
        workflowsMap={clientWorkflows}
        useServerProxy={false}
      />
    </div>
  )
}
