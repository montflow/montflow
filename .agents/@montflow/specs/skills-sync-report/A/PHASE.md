---
id: A
objective: Make mf-skills sync print a concise per-outcome summary of added/updated/unchanged/skipped skills, matching the --check style and the renderer token contract.
status: pending
review: waived
review-reason: light rigor default: every task gate is the review evidence.
review-evidence: A001:0, A002:0, A003:0
gate: none
---

# Phase A

## Notes

The phase makes write-mode `mf-skills sync` report a concise per-outcome summary
of added/updated/unchanged/skipped skills, matching the `--check` style. Review
is waived (`light` rigor): each task's mechanical gate is the review evidence,
and the phase locks on every task being complete and every gate proven.

The tasks run as one ready set — they touch disjoint files with no data or
ordering dependency:

- A001 `report-sync-summary` — the write-mode renderer (`renderers.apps.module.ts`).
- A002 `front-end-parity` — the binary and slash handlers (`binary.apps.module.ts`,
  `slash.apps.module.ts`), which both render through `Renderers.sync`.
- A003 `summary-tests` — engine, renderer, and end-to-end report-byte tests.

The write-scopes are disjoint (each names a different file set), so no
`depends-on` edge is needed and all three start in wave 1.
