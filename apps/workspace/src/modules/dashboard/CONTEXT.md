# Dashboard module

Grid layout model for the workspace dashboard. Holds the panel registry,
the `Cell`/`Column`/`Layout` schemas, the default grid, plus pure
selection helpers — no Solid, no OpenTUI, no IO. `index.tsx` loads
`.agents/@montflow/dashboard/layout.json` (falling back to
`DEFAULT_LAYOUT`), passes it into `App`, which mirrors selection into a
signal and renders columns of `PanelCard`s.

## Belongs here

- `PANELS` registry plus `titleFor` fallback
- `Cell`/`Layout` Schema Classes, `DEFAULT_LAYOUT`, `decodeLayout`
- Derived views (`flatten`, `firstPanel`, `selectByKeybind`)

## Does not belong here

- Workspace identity — that lives in `../workspace/`
- Layout file IO — `app.tsx` reads the JSON file, this module only decodes
- Rendering, keyboard handling, signals — those live in `app.tsx` plus
  `components/`
- Git reads — the git-info service maps git output into `Workspace.Info`
