import { useState, useEffect } from 'react'

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32)
}

export default function PromptForm({ onSubmit, disabled, initialValues }) {
  const [prompt, setPrompt] = useState('')
  const [steps, setSteps] = useState(10)
  const [guidance, setGuidance] = useState(3.5)
  const [seed, setSeed] = useState(randomSeed)
  const [width, setWidth] = useState(512)
  const [height, setHeight] = useState(512)
  const [checkpoint, setCheckpoint] = useState('flux1-dev-fp8.safetensors')

  // When a stored image's settings are loaded, populate the form
  useEffect(() => {
    if (!initialValues) return
    if (initialValues.prompt    != null) setPrompt(initialValues.prompt)
    if (initialValues.steps     != null) setSteps(initialValues.steps)
    if (initialValues.guidance  != null) setGuidance(initialValues.guidance)
    if (initialValues.seed      != null) setSeed(initialValues.seed)
    if (initialValues.width     != null) setWidth(initialValues.width)
    if (initialValues.height    != null) setHeight(initialValues.height)
    if (initialValues.checkpoint != null) setCheckpoint(initialValues.checkpoint)
  }, [initialValues])

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({
      prompt,
      steps: Number(steps),
      guidance: Number(guidance),
      seed: Number(seed),
      width: Number(width),
      height: Number(height),
      checkpoint,
    })
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a whimsical treehouse in a cherry blossom tree, cinematic lighting"
          rows={4}
          required
        />
      </div>

      <div className="params-grid">
        <div className="field">
          <label htmlFor="steps">Steps</label>
          <input id="steps" type="number" value={steps} onChange={(e) => setSteps(e.target.value)} min={1} max={150} step={1} />
        </div>

        <div className="field">
          <label htmlFor="guidance">Guidance</label>
          <input id="guidance" type="number" value={guidance} onChange={(e) => setGuidance(e.target.value)} min={0} max={20} step={0.5} />
        </div>

        <div className="field">
          <label htmlFor="width">Width</label>
          <input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} min={64} max={2048} step={64} />
        </div>

        <div className="field">
          <label htmlFor="height">Height</label>
          <input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} min={64} max={2048} step={64} />
        </div>

        <div className="field seed-field">
          <label htmlFor="seed">Seed</label>
          <div className="seed-row">
            <input id="seed" type="number" value={seed} onChange={(e) => setSeed(e.target.value)} min={0} max={4294967295} step={1} />
            <button type="button" className="btn-secondary btn-small" onClick={() => setSeed(randomSeed())} title="New random seed">↺</button>
          </div>
        </div>

        <div className="field checkpoint-field">
          <label htmlFor="checkpoint">Checkpoint</label>
          <input id="checkpoint" type="text" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} />
        </div>
      </div>

      <button type="submit" className="btn-primary btn-generate" disabled={disabled}>
        {disabled ? 'Generating…' : 'Generate'}
      </button>
    </form>
  )
}
