---
id: C002
name: realtime-canvas
type: execution
originator: user
depends-on: C001
related-tasks: C003
status: complete
---

# Task C002: realtime-canvas

## Type: execution

## Description

Implement the surface chosen in `C001-canvas-surface/MEMORY.md` (§ Handoff): a
realtime trace timeline that grows while a session runs. Keep the existing data
layer (`tail`, `fold`, `sqlite`) and the `/mf-telemetry` lifecycle; replace the
phase B DOM row list with the canvas renderer.

## Requirements

- The trace pane is canvas-rendered (PixiJS per C001) and the shell stays DOM:
  session list, filter, detail inspector, controls, and keyboard handling.
- Live growth: events appended to the NDJSON store appear on the timeline within
  one second, with no full page reload and without rebuilding the whole trace.
  Follow-tail is the default; a manual pan/zoom pauses follow-tail and an
  explicit action resumes it.
- Lanes cover the session, execution, steps, tools, permissions, and
  compactions. A time axis, zoom, pan, and minimap are present.
- 20k spans meet the acceptance test recorded in `C001-canvas-surface/MEMORY.md`
  (§ Handoff): first paint, append latency, pan/zoom p95, and heap. The render
  path uses typed-array span layout, viewport culling, level-of-detail labels,
  and pooled text; no per-span DOM nodes.
- Expose the identity and hit-test hooks C003 needs: a per-span icon slot and a
  pointer/keyboard lookup that returns the span under the cursor.
- `/mf-telemetry` remains the only entry point, the viewer still starts only on
  explicit action, and close/idle still stops the loopback listener.
- Collection is untouched: the viewer never writes NDJSON or authoritative
  state. Carry the unresolved phase B data-layer findings into this task
  (short-file live append, rewritten-file reset, per-tab close, session-list
  freshness) and do not regress them.
- Tests cover the live reducer/append path, layout and hit-testing, the
  follow-tail pause/resume state, lifecycle, and the 20k acceptance harness.

## Completion

- [x] The chosen canvas surface renders a session timeline with lanes, axis, zoom, pan, and minimap.
- [x] A running session appends spans within one second without a full reload; follow-tail pauses on manual scroll and resumes explicitly.
- [x] The 20k acceptance test in `C001-canvas-surface/MEMORY.md` passes.
- [x] `/mf-telemetry` starts and stops the viewer with no process left behind; nothing listens before the command.
- [x] The data layer is unchanged and the ingest isolation tests still pass.
- [x] `bun run --cwd packages/telemetry test ts:check lint:check format:check` passes.
