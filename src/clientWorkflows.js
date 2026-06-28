// Bundled workflows for the static client build (no server required).
// import.meta.glob is resolved by Vite at build time — all matching JSON files
// are inlined into the bundle. flux-image.json is excluded (image workflow only).
const modules = import.meta.glob('../workflows/*.json', { eager: true })

export const clientWorkflows = Object.fromEntries(
  Object.entries(modules)
    .filter(([p]) => !p.endsWith('flux-image.json'))
    .map(([p, mod]) => [
      p.replace('../workflows/', '').replace(/\.json$/, ''),
      mod.default,
    ])
)
