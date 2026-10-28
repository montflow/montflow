# Memory

## Context

User doubts the TUI can render large session traces. Phase A assumed `session.panel`; this task reopens the surface decision and must settle it with measurements.

Candidates: OpenTUI panel, static HTML export, `Bun.serve` browser UI, native webview (`webview-bun` / Electrobun), third-party UI.

## Progress

- pending

## Open Questions

- What is the realistic worst-case span count for one session in this repo's own usage?
- Does OpenTUI virtualize long lists, or does the panel receive every row?
- Is WebKitGTK an acceptable system dependency on the primary dev machine?
- Does Electrobun's bundling model conflict with shipping this as an npm-installable OpenCode plugin?

## Handoff

- Decision goes to `B001-render-surface/MEMORY.md` (§ Handoff); B002 implements it.

## Deviations

- None.
