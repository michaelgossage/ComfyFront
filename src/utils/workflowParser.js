// Known node fields and how to render them
const FIELD_META = {
  CLIPTextEncode:        { text:          { type: 'textarea' } },
  LoadImage:             { image:         { type: 'image' } },
  RandomNoise:           { noise_seed: { type: 'number', min: 0, step: 1, isSeed: true } },
  KSampler:              {
    seed:          { type: 'number', min: 0, step: 1, isSeed: true },
    steps:         { type: 'number', min: 1,   max: 150, step: 1 },
    cfg:           { type: 'number', min: 0,   step: 0.1 },
    denoise:       { type: 'number', min: 0,   max: 1, step: 0.01 },
    sampler_name:  { type: 'text' },
    scheduler:     { type: 'text' },
  },
  CheckpointLoaderSimple: { ckpt_name:    { type: 'text' } },
  EmptySD3LatentImage:   { width: { type: 'number', min: 64, step: 64 }, height: { type: 'number', min: 64, step: 64 }, batch_size: { type: 'number', min: 1, step: 1 } },
  EmptyLatentImage:      { width: { type: 'number', min: 64, step: 64 }, height: { type: 'number', min: 64, step: 64 }, batch_size: { type: 'number', min: 1, step: 1 } },
  FluxGuidance:          { guidance:      { type: 'number', min: 0, step: 0.5 } },
}

// Priority order for sorting fields in auto-detect mode
const CLASS_ORDER = ['CLIPTextEncode', 'LoadImage', 'CheckpointLoaderSimple', 'EmptySD3LatentImage', 'EmptyLatentImage', 'FluxGuidance', 'KSampler']

function isLink(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number'
}

function prettifyKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function makeField(nodeId, key, label, node) {
  const meta = FIELD_META[node.class_type]?.[key]
  const defaultValue = node.inputs?.[key] ?? ''
  return {
    nodeId,
    key,
    label,
    type: meta?.type ?? (typeof defaultValue === 'number' ? 'number' : 'text'),
    defaultValue,
    min:    meta?.min,
    max:    meta?.max,
    step:   meta?.step,
    isSeed: meta?.isSeed ?? false,
    _classType: node.class_type,
  }
}

// Returns an array of editable field descriptors for the workflow.
// If the workflow has a _ui.fields section, only those fields are returned (in that order).
// Otherwise, all non-link primitive inputs are auto-detected.
export function parseWorkflow(workflow) {
  const uiFields = workflow._ui?.fields

  if (uiFields) {
    return uiFields
      .map(({ nodeId, key, label }) => {
        const node = workflow[nodeId]
        if (!node) return null
        return makeField(nodeId, key, label ?? prettifyKey(key), node)
      })
      .filter(Boolean)
  }

  // Auto-detect all non-link primitives
  const fields = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (nodeId.startsWith('_')) continue
    const { class_type, inputs = {}, _meta = {} } = node
    for (const [key, value] of Object.entries(inputs)) {
      if (isLink(value)) continue
      const label = _meta.title ? `${_meta.title} — ${prettifyKey(key)}` : `${class_type} — ${prettifyKey(key)}`
      fields.push(makeField(nodeId, key, label, node))
    }
  }

  fields.sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a._classType)
    const bi = CLASS_ORDER.indexOf(b._classType)
    const orderDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return orderDiff !== 0 ? orderDiff : a.nodeId.localeCompare(b.nodeId)
  })

  return fields
}

// Returns a filled copy of the workflow with user values substituted in.
// Strips _ui and any other underscore-prefixed metadata keys before returning.
export function fillWorkflow(workflow, fieldValues) {
  const filled = JSON.parse(JSON.stringify(workflow))
  for (const key of Object.keys(filled)) {
    if (key.startsWith('_')) delete filled[key]
  }
  for (const [fieldKey, value] of Object.entries(fieldValues)) {
    const [nodeId, key] = fieldKey.split('::')
    if (filled[nodeId]?.inputs) {
      filled[nodeId].inputs[key] = value
    }
  }
  return filled
}
