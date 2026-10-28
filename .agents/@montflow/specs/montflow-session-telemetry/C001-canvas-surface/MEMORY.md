# Memory

## Context

Phase B chose a DOM virtualized list (`B001-render-surface/MEMORY.md`). The user
rejected the look of Perfetto and wants an owned surface with a growing
timeline, not a static trace page.

Candidates:

- **Hybrid**: DOM shell (sessions, filter, detail inspector, controls) plus a
  PixiJS canvas for the timeline/waterfall.
- **All-canvas**: PixiJS for panels and controls too, optionally on the Ritmo
  ECS runtime (`@typeonce/ritmo`, MIT, ECS/game loop with a Pixi adapter).
- **Baseline**: the current DOM list + virtualization.

Known facts: Perfetto UI is Apache-2.0 and capable but the user dislikes it;
Speedscope is MIT and lighter but still a foreign surface. PixiJS is MIT and
GPU-renders 20k quads cheaply; text-heavy controls and accessibility remain a
DOM concern. Ritmo is not a UI library.

## Progress

- 2026-10-28: complete. Ran throwaway spikes with PixiJS 8.22.0 under headless
  Chromium 144 (SwiftShader WebGL, 1400×800, DPR 1): 20k spans, 120 pan/zoom
  steps, 600 appends at 100ms, JS heap from CDP. Two runs in opposite mode order
  to separate cold-start from steady state. Spike code deleted; no production
  code written.

  - **Hybrid** (DOM shell + Pixi timeline): first paint **177ms warm /
    563ms cold**; pan/zoom p50 16.7ms, **p95 16.9ms**, max 17.3ms; append
    latency avg 10.7ms, **p95 17.8ms**, max 24.9ms; heap **9.8MB**.
  - **All-canvas** (Pixi shell + timeline): first paint **528ms cold**;
    pan/zoom p95 16.9ms, max 29.4ms; append p95 18.1ms, max **90.4ms**; heap
    7.2MB.
  - **DOM baseline** (current virtualized list): first paint 108ms; scroll p95
    16.8ms; append p95 1.1ms; heap 10.6MB. Cheap rows, but no timeline/zoom and
    the surface the user rejected.
  - **Bundle**: app + Pixi minified **575KB** (`bun build --minify`); Pixi
    installed tree 83MB, source-only. Ritmo core dist 2.0MB, Pixi adapter 36KB
    plus its render package; no UI exports.
  - **Ritmo verdict: rejected.** `@typeonce/ritmo-pixi` exports only a
    `PixiNodeRegistry`; Ritmo is an ECS with a fixed-step game loop, schema,
    queries, rollback, and netcode. A trace is an immutable, append-only array,
    so those features buy nothing and the game loop/schema cost is pure
    overhead. No UI primitives exist to replace the shell.

## Open Questions

- None blocking. Canvas text will use BitmapText/MSDF and viewport-only labels;
  the spike's 40 canvas `Text` objects are enough to prove the layout, not the
  final text path.
- The spike measured JS heap only; GPU texture memory needs a check in C002 if
  the icon atlas grows.

## Handoff

### Decision

**Hybrid**: DOM shell + PixiJS canvas timeline. All-canvas is rejected: it
gives no frame-time win over hybrid, adds a 90ms append spike, and makes text
selection, browser find, IME, and screen-reader access a custom build. The DOM
baseline stays only as a fallback for the row/table view; it is not the trace.

### Matrix (measured, 20k spans)

| Axis | Hybrid DOM + Pixi | All-canvas Pixi | DOM baseline | Ritmo/Pixi |
| --- | --- | --- | --- | --- |
| First paint | 177ms warm / 563ms cold | 528ms cold | 108ms | not spiked; ECS setup on top |
| Pan/zoom p95 | 16.9ms | 16.9ms | 16.8ms (scroll) | n/a |
| Pan/zoom max | 17.3ms | 29.4ms | 17ms | n/a |
| Append p95 / max | 17.8 / 24.9ms | 18.1 / 90.4ms | 1.1ms | n/a |
| Heap | 9.8MB | 7.2MB | 10.6MB | n/a |
| Bundle | 575KB min | 575KB min | ~2KB app JS | +2MB core + adapters |
| Timeline/zoom | yes | yes | no | renderer only |
| Text/accessibility | DOM native | custom canvas | DOM native | none |
| Verdict | **chosen** | rejected | fallback only | rejected |

### Architecture for C002

- **DOM shell owns**: session list, filter, detail inspector, buttons, keyboard
  order, focus, copy, and accessible text. **Canvas owns only the timeline**:
  lanes, span bars, time axis, minimap, hover highlight.
- **Layout**: structure-of-arrays — `Float32Array` for start/duration,
  `Uint8Array` for lane/kind, `Uint32Array` for color; one `ParticleContainer`
  (or instanced quads) for 20k bars. Appends push to the arrays and add one
  particle; no full rebuild.
- **Text/LOD**: pooled `BitmapText`/MSDF labels, only for spans wider than a
  threshold in the viewport, max ~100 labels; no label below 6px.
- **Culling**: per-lane sorted start times + binary search for the viewport;
  pan/zoom only changes the container transform.
- **Hit-testing**: `pick(x, y): spanIndex | undefined` via per-lane interval
  search, with a 1×1 ID picking buffer as the fallback for overlapping spans.
  This is the C003 hook.
- **Icon hook**: `iconFrame(span): atlasFrame | undefined` on the canvas bar;
  provider/tool atlas lookup lives in C003, the slot is reserved here.
- **Worker**: optional parse/filter/index off-main; append + render stay on the
  main thread for the one-second budget.
- **Live**: `/api/live` poll (400ms) appends to the arrays and follows the tail
  unless the user panned/zoomed; explicit resume re-enables follow.

### C002 acceptance test (pass condition)

1. 20k spans render; first paint ≤1000ms cold and ≤400ms warm.
2. 120 pan/zoom steps: p95 frame interval ≤20ms, max ≤50ms.
3. 600 appends at 100ms: p95 visible latency ≤50ms, max ≤100ms; timeline grows
   without a reload or full rebuild.
4. JS heap ≤50MB at 20k spans.
5. No per-span DOM nodes; bars are a typed-array/particle layout; labels ≤100
   and viewport-only.
6. `pick(x, y)` returns the correct span for a pointer and keyboard navigation.
7. Follow-tail is on by default, pauses on manual pan/zoom, resumes explicitly.
8. The viewer lifecycle and collector isolation still pass their gates.

## Deviations

- Headless Chromium uses SwiftShader, not a GPU; frame times are CPU/software
  rasterized and therefore conservative. First paint includes Pixi/WebGL init
  and shader compilation, so cold and warm numbers are both recorded.
- The all-canvas spike draws the shell in Pixi but does not implement inputs;
  it measures rendering only. Its accessibility gap is a structural finding,
  not a missing measurement.
- The 40 canvas labels are static; MSDF/LOD text is a C002 implementation
  detail, not a C001 spike result.
- The matrix pairs hybrid warm (177ms) with all-canvas cold (528ms). Hybrid
  cold is 563ms; both meet the 1000ms gate, but the warm-vs-cold pairing is
  not apples-to-apples and is called out rather than hidden.
