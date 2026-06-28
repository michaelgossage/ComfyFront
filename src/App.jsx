import { useState, useEffect } from 'react'
import { useRunPod } from './hooks/useRunPod'
import Settings from './components/Settings'
import PromptForm from './components/PromptForm'
import ImageGallery from './components/ImageGallery'
import LocalComfyTab from './components/LocalComfyTab'
import RunPodVideoTab from './components/RunPodVideoTab'
import BatchRunTab from './components/BatchRunTab'
import StatsPanel from './components/StatsPanel'
import { getAllImages, updateRating } from './utils/imageStore'
import logger from './utils/logger'

function ProjectSelector({ value, onChange }) {
  return (
    <div className="project-selector">
      <label htmlFor="project-input">Project</label>
      <input
        id="project-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. logo-concepts"
        className="project-input"
      />
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('runpod')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [project, setProject] = useState('')
  const [storedImages, setStoredImages] = useState([])
  const [reuseValues, setReuseValues] = useState(null)

  const { submit, status, jobId, images, errorMessage, reset } = useRunPod()

  const isGenerating = status === 'submitting' || status === 'polling'

  useEffect(() => {
    getAllImages()
      .then(setStoredImages)
      .catch((err) => logger.error('App', 'Failed to load stored images', err))
  }, [])

  useEffect(() => {
    if (status === 'completed') {
      getAllImages()
        .then(setStoredImages)
        .catch((err) => logger.error('App', 'Failed to refresh stored images', err))
    }
  }, [status])

  function handleSubmit(params) {
    submit(params, project)
  }

  async function handleRatingChange(id, rating) {
    try {
      await updateRating(id, rating)
      setStoredImages((prev) =>
        prev.map((img) => img.id === id ? { ...img, rating } : img)
      )
    } catch (err) {
      logger.error('App', 'Failed to update rating', err)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">ComfyFront</h1>
        <div className="header-controls">
          <ProjectSelector value={project} onChange={setProject} />
          <button className="btn-secondary" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}

      <div className="tabs">
        <button className={`tab-btn${tab === 'runpod' ? ' active' : ''}`} onClick={() => setTab('runpod')}>RunPod</button>
        <button className={`tab-btn${tab === 'local' ? ' active' : ''}`} onClick={() => setTab('local')}>Local ComfyUI</button>
        <button className={`tab-btn${tab === 'video' ? ' active' : ''}`} onClick={() => setTab('video')}>RunPod Video</button>
        <button className={`tab-btn${tab === 'batch' ? ' active' : ''}`} onClick={() => setTab('batch')}>Batch</button>
        <button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>Stats</button>
      </div>

      {tab === 'local' && <LocalComfyTab project={project} />}
      {tab === 'video' && <RunPodVideoTab project={project} />}
      {tab === 'batch' && <BatchRunTab />}
      {tab === 'stats' && (
        <div className="panel" style={{ marginTop: 0 }}>
          <StatsPanel />
        </div>
      )}
      {tab === 'runpod' && <main className="app-main">
        <section className="panel panel-form">
          <PromptForm onSubmit={handleSubmit} disabled={isGenerating} initialValues={reuseValues} />
        </section>
        <section className="panel panel-gallery">
          <ImageGallery
            status={status}
            images={images}
            storedImages={storedImages}
            errorMessage={errorMessage}
            jobId={jobId}
            onReset={reset}
            onRatingChange={handleRatingChange}
            onReuseSettings={setReuseValues}
          />
        </section>
      </main>}
    </div>
  )
}
