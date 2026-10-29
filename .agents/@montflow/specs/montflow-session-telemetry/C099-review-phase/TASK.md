---
id: C099
name: review-phase
type: review
originator: user
depends-on: C001, C002, C003
related-tasks: C001, C002, C003
reviewer-profiles: effect-reviewer
status: complete
---

# Task C099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase C: the canvas surface
decision, the realtime timeline, and the trace embeds.

## Requirements

- Findings written to the phase review round for the spec's own series and the
  `effect-reviewer` series.
- `C001-canvas-surface/MEMORY.md` (§ Handoff) is judged on evidence: do the
  spike numbers support the hybrid/all-canvas choice, and are the rejected
  options rejected for real reasons?
- The realtime claim is verified end to end: an append is visible within one
  second, follow-tail pauses and resumes, and the page does not rebuild the
  whole trace.
- Icons and tooltips are checked for local-only assets, correct fallbacks, and
  redaction in hover/inspector content.
- The viewer lifecycle is verified to leave no listener or process behind, and
  the collector path is re-checked for driver and network imports.
- Any unresolved phase B data-layer finding carried into C002 is checked as
  fixed, not restated.

## Completion

- [x] Findings written and reviewed (rounds 005-010 in both series; majors resolved, residual gaps recorded as Won't Fix).
