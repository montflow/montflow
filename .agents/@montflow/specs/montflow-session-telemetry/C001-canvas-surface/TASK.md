---
id: C001
name: canvas-surface
type: exploratory
originator: user
depends-on: B002
related-tasks: C002, C003
status: pending
---

# Task C001: canvas-surface

## Type: exploratory

## Description

Decide the realtime trace renderer. Phase B shipped a DOM virtualized list; the
user rejected the look of third-party viewers and wants an owned surface whose
timeline visibly grows while a session runs, with provider/tool identity and
hover detail.

Evaluate a **hybrid** surface (DOM shell + PixiJS canvas timeline) against an
**all-canvas** surface (PixiJS everywhere, optionally using the Ritmo ECS
runtime) and the **current DOM baseline**. Ritmo is an ECS/game runtime with a
Pixi adapter, not a UI component library; include it only if it removes code
from the renderer, and reject it if it only adds a paradigm.

## Requirements

- Judge every candidate on: 20k spans; realtime append (1 event/100ms for 60s)
  without a full reload; pan/zoom frame cost; first paint; heap; bundle size;
  build/dependency weight; accessibility and text selection; testability
  without a real display.
- Spike the leading two: render 20k synthetic spans, then stream 600 appends,
  and record first paint, pan/zoom p50/p95/max frame times, append frame cost and
  visible latency, and peak memory. Delete the spike code.
- Evaluate Ritmo explicitly: MIT, ECS + fixed-step loop + Pixi adapter; state
  whether its queries/rollback/devtools reduce renderer code or are dead weight
  for a timeline of immutable spans.
- Decide the canvas architecture: DOM shell responsibilities, canvas
  responsibilities, worker role, text/LOD strategy, hit-testing, and the
  typed-array layout. Name the icon/tooltip hooks C003 will consume.
- Record the matrix, measured numbers, chosen surface, rejected reasons, and
  the concrete acceptance test for C002 in `C001-canvas-surface/MEMORY.md`
  (§ Handoff). No production code lands in this task.

## Completion

- [ ] `C001-canvas-surface/MEMORY.md` (§ Handoff) records the matrix and measured spike numbers.
- [ ] One surface is chosen (hybrid or all-canvas), with Ritmo accepted or rejected for a stated reason.
- [ ] C002's acceptance test is measurable: first paint, append latency, pan/zoom p95, heap, and 20k span count.
- [ ] The icon/tooltip hooks for C003 are named.
- [ ] Any spike code is deleted.
