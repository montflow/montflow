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

- pending

## Open Questions

- Does the hybrid split keep pan/zoom at 60fps while the DOM inspector updates?
- Is canvas text (BitmapText/MSDF, viewport-only labels) acceptable for the
  density this trace needs?
- Does Ritmo's ECS reduce renderer code, or does it add a game loop and schema
  that a read-only timeline does not need?

## Handoff

- Decision goes to `C001-canvas-surface/MEMORY.md` (§ Handoff); C002 implements
  it and C003 consumes the icon/tooltip hooks.

## Deviations

- None.
