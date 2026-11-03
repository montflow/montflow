# Memory

## Context

Finish the manual-check audit D001 started. The remaining gaps are in the
prompt, profile, review, and discovery skills: each scans or self-checks by hand
while `mf-prompts verify`, `mf-profiles verify`, `mf-reviews resume`, and
`mf-skills list` already answer.

## Progress

- 2026-11-02: pending, not started.

## Open Questions

- The profiles skills are workspace-only, not package payload. If they later get
  shipped, add them to the owning package and doctor manifest; this task only
  updates the workspace copies and names the in-repo CLI form.

## Handoff

- D001 owns the spec-authoring profile discovery; this task must not edit the
  `reviewer-profiles` rule again.
- E003 owns the parallel-phase authoring guidance; keep this task to CLI-first
  verification and discovery.

## Deviations

- None yet.
