# Memory

## Context

Task C007: align `effect-testing` with the `.js` decision while keeping test-author separation.

## Progress

- 2026-10-07: complete. Updated `SKILL.md` and `GATES.md`; released `2.1.0`.

## Findings

- Test-author separation kept as a hard rule.
- Module imports now use `../index.js`; the `Layer.effectContext` example was corrected to the Effect-yielding-`Context` signature (it previously passed two arguments).
- Gate evidence: `mf-skills verify effect-testing` → `0 issues`.

## Open Questions

- None.

## Handoff

- C010 audits the result.

## Deviations

- Fixed a pre-existing invalid `Layer.effectContext` example while touching the file (leaving-it-cleaner).
