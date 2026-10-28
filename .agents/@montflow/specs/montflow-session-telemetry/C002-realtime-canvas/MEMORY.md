# Memory

## Context

C002 replaces the phase B DOM row list with the hybrid surface chosen in C001:
a DOM shell (sessions, filter, detail, controls) and a PixiJS canvas timeline.
The data layer is unchanged: NDJSON tail by offset, `telemetry.db` fold, and
`/api/live` seeded from fold offsets.

The live loop carries the phase B re-review findings: appends to a short day
file, rewritten day files, multiple tabs, and session-list freshness.

## Progress

- 2026-10-28: complete. The viewer page is a DOM shell plus a PixiJS 8.22
  timeline; Pixi is served locally from the installed dependency at
  `/pixi.mjs` (822KB minified), so no CDN or build step is needed.
- 20k acceptance run against the real viewer (headless Chromium 144,
  SwiftShader, 1400×900 window; canvas 1190×770):
  - first paint **606ms** (budget ≤1000ms)
  - 120 wheel zoom steps: avg 16.65ms, **p95 17.2ms**, max **29.6ms**, 1
    frame over 20ms (budget p95 ≤20ms, max ≤50ms)
  - 20,001st span appeared **254ms** after the NDJSON append (budget ≤1s)
  - JS heap **13.2MB** (budget ≤50MB)
  - no page errors; totals `20000 spans · $20.5704 · 2057040 in / 514260 out`
- Follow-tail verified: a wheel interaction flips the button to `paused`;
  clicking it returns `following`. Keyboard selection (`ArrowRight`) opens the
  DOM detail inspector.
- Lifecycle/API tests unchanged and green; `pixi.js` is a runtime dependency
  and the packed artifact carries it.

## Open Questions

- The canvas currently draws 20k particles in one `ParticleContainer`; a
  future icon layer will add visible-only sprites. Keep the icon pool small.
- Pointer hit-testing scans the span array; if pointer-move cost grows, switch
  to a per-lane interval index.

## Handoff

### Shape

- `page()` is a DOM shell plus one inline module script; it dynamically imports
  `/pixi.mjs`, which the server resolves from `pixi.js/package.json` and serves
  locally. No CDN, no browser build step.
- The timeline uses one `ParticleContainer` of 1×1 white particles tinted by
  lane; pan/zoom transform the container, appends add one particle, and the
  renderer ticker paints. The minimap is a Pixi `Graphics` overlay.
- Lanes: session, step, tool, permission, compaction. Time axis labels and lane
  labels are Pixi `Text`; per-span labels are a deliberate LOD level 0 (the
  tooltip/detail carry span text).
- `pick(x, y)` maps pointer position to a span by lane + nearest timestamp;
  `ArrowLeft`/`ArrowRight` move selection and open the detail inspector.
- Live: `/api/live` returns all sessions, the page buffers per session, appends
  the active session to the canvas, and follows the tail unless the user zooms
  or drags. Fold offsets seed the cursors; fingerprints reset a rewritten file.
- C003 hooks: the tooltip/detail already consume `line.model.providerID` and
  the payload; add the icon atlas in a visible-only `Container` above the
  particles and keep `pick` as the hover source.

### Acceptance

- First paint, pan/zoom p95/max, append latency, and heap are recorded above
  and meet C001's thresholds.
- `pack:plugins` emits `server.js` containing the page and the `pixi.js`
  dependency; no `main.ts`-style source entry is referenced.

## Deviations

- The app keeps span records as objects for hit-test/tooltip; the typed-array
  and instanced layout lives in Pixi's `ParticleBuffer`/`ParticleContainer`.
  No per-span DOM nodes exist.
- Per-span text labels are not drawn; lane and axis labels are. This is the LOD
  level 0 and avoids 20k text textures. C003's tooltip/detail is the text path.
- Pixi is served from the package dependency rather than bundled into the
  page. The browser still loads it from the local viewer origin, never a CDN.
- The page remains a template string (no client build pipeline); the script is
  parsed by a test and exercised in the headless acceptance run.
