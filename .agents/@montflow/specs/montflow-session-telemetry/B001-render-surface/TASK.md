---
id: B001
name: render-surface
type: exploratory
originator: user
depends-on:
related-tasks: B002
status: complete
---

# Task B001: render-surface

## Type: exploratory

## Description

Decide where a session trace is rendered. Phase A assumed an in-TUI `session.panel`; that assumption is unproven for large traces, and it is the wrong thing to build twice.

A single long session can produce thousands of rows: steps, model calls, tool calls, retries, compactions. A terminal panel has no horizontal timeline, no zoom, no independent scroll regions, and its row throughput is unmeasured. This task measures candidates and records a decision with evidence before any viewer code is written.

Candidates to evaluate, at minimum:

1. **TUI panel** — `session.panel` slot in OpenTUI. Already wired, no new dependency, no new process.
2. **Static HTML export** — one self-contained file per session, opened in a browser. No runtime dependency, not live.
3. **On-demand web UI** — `Bun.serve` on localhost with a virtualized list, opened in the user's default browser.
4. **Native webview** — `webview-bun` (thin bindings, needs system WebKitGTK on Linux) or Electrobun (bundles its own runtime and build toolchain).
5. **Third-party UI** — Phoenix, Jaeger, or similar, fed by an export. Included only to be ruled out explicitly.

## Requirements

- Every candidate is judged on the same axes: usable at 20k spans; scrolling and zooming without dropped frames; search and filter across spans; install weight (bytes and native system packages); startup latency; cross-platform viability with Linux/Wayland as the primary target; development cost; and testability without a real GUI.
- Hard constraint carried from the spec: nothing collects in the background. A candidate that requires a standing process is rejected unless the process is started by explicit user action and exits when idle.
- The leading two candidates each get a spike: render 20,000 synthetic spans and record first-paint time, scroll frame timing, and peak memory. Spike code is throwaway and does not land.
- Record the results in `B001-render-surface/MEMORY.md` (§ Handoff): the matrix, the measured numbers, the chosen surface, the rejected reasons, and the concrete acceptance test B002 must pass.
- The decision names how large traces stay usable: virtualization strategy, row budget per frame, and what is collapsed by default.
- The decision names the on-demand lifecycle: what starts the viewer, what stops it, and the idle timeout.
- The decision must keep `/telemetry` as the single entry point, whatever the surface.
- No production code is written in this task.

## Completion

- [x] `B001-render-surface/MEMORY.md` (§ Handoff) records the matrix and measured spike numbers.
- [x] One surface is chosen, with a stated reason each other surface was rejected (on-demand web UI; TUI, static, native webview, and third-party rejected with numbers).
- [x] B002's acceptance test is written to be measurable, not aspirational (8 numbered pass conditions with thresholds).
- [x] Any spike code is deleted (`apps/workspace/scratchpad/spike-*.ts` and `/tmp/telemetry-spikes/*` removed).
