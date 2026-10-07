# Memory

## Context

Task C099: adversarial review of the Phase C implementation, written to
`.agents/@montflow/reviews/montflow-ci-verification/C.md`.

## Progress

- 2026-10-07: complete.

## Findings

- C.md raised 11 findings (0 Critical, 2 Major, 6 Minor, 3 Nit).
- Fixed and verified: F1 (invalid-slug profile dirs dropped), F3 (missing store
  passed silently), F5 (hook guard ignored missing deps), F6 (no real-store
  `readAllRaw` tests), F7 (C003 completion wording), F8 (missing `bin`), F9
  (`mf-profiles` verb/`--dir=` parsing and silent failures), F11 (release-push
  overlap wording).
- Accepted as `Won't Fix` with rationale: F2 (specs/runs doctor byte-freshness
  is a follow-up; skills/prompts do compare), F4 (CI matrix mirrors per-target
  scripts for attribution), F10 (changeset config is the release-notes
  mechanism).
- After the fixes, `bun run verify:montflow` is green: 15 turbo tasks, then
  skills/prompts/specs/profiles/runs verifies all pass.

## Open Questions

- None.

## Handoff

- Spec locked; all phases complete.

## Deviations

- A C re-review (iteration 2) was not run; the fixes were verified directly by
  re-running the gate and the affected package tests, and each fix records the
  command output in C.md's `[Fixer]` turns.
