# Memory

## Context

Phase C replaced the DOM row list with the hybrid canvas timeline, added
provider/tool identity, and made the trace grow live. Two independent review
series ran rounds 005-010 (`montflow-session-telemetry` and
`montflow-session-telemetry-effect-reviewer`).

## Progress

- 2026-10-28: complete. Round 005-010 reviews filed and addressed. All major
  findings are resolved: history provider marks, folded-string model parsing,
  live-from-empty scale, pixel-accurate picking, file-scoped rewrites, full
  prefix fingerprints, reset scoping, fold-error visibility, keyboard/ARIA
  paths, filter propagation, and payload-safe tooltips.
- Final package checks: 174 tests (157 vitest + 17 bun), `ts:check`,
  `lint:check`, `format:check` (44 files), `viewer:acceptance` green:
  first paint 623.2ms, pan p95 19ms / max 31.1ms, live append 257ms, heap
  14.1MB at 20k spans.
- Post-round-010 reset/provenance fixes were verified by the package tests,
  endpoint tests, and the acceptance script; the review loop was stopped there
  because every remaining round was iterating the same rewrite edge rather
  than finding a new class of defect.

## Open Questions

- None blocking. Residual gaps are recorded as terminal `Won't Fix` items in
  the round files: the browser acceptance harness is manual (no Chromium in
  CI), late-created day files are not fingerprint-watched, and a rewrite that
  preserves the folded prefix is indistinguishable from an append.

## Handoff

- Phase C is the shipping surface. `/telemetry` starts the in-process viewer;
  the data layer, collector isolation, and lifecycle are unchanged.
- The packaged artifact carries `pixi.js`; the viewer serves `/pixi.mjs` from
  the installed dependency and the page from `server.js`.

## Deviations

- Browser performance evidence is recorded from a manual Chromium 144 run,
  not CI.
- Provider and tool marks are local letter/glyph assets, not third-party logos;
  tool names are used when the host event carries them, otherwise the neutral
  tool mark is shown.
- The canvas uses Pixi's typed/instanced particle buffer; the app keeps span
  records for hit-test and detail, not a second typed-array model.
