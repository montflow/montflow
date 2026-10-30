# Memory

## Context

Task C008: align `effect-v4` to the `Data.TaggedError` error model and reconcile its module-surface example.

## Progress

- 2026-10-07: complete. Updated `SKILL.md`, `references/SCHEMA.md`, and `references/SERVICES_LAYERS.md`; released `1.2.0`.

## Findings

- `Data.TaggedError` replaces the `Schema.TaggedErrorClass` mandate in all three files.
- `references/SERVICES_LAYERS.md` now states the self-export module surface is an Effect API reference, not the montflow module law.
- Pre-existing defect found: `SKILL.md` failed `mf-skills verify` (missing `# When To Use`, `# Pipeline`, `# Reference`). Restructured the headings (body content preserved) so the skill now verifies.
- Gate evidence: `mf-skills verify effect-v4` → `0 issues`.

## Open Questions

- None.

## Handoff

- C010 audits the result.

## Deviations

- Scope grew beyond the B002 step 10 note to repair the pre-existing body-schema failure, because C010's conformance gate requires every changed skill to verify valid.
