# Memory

## Context

Task C004: align `typescript-file-structure` with the B001 decisions and the C001 module law.

## Progress

- 2026-10-07: complete. Rewrote `SKILL.md` and `GATES.md`; released `2.0.0`.

## Findings

- `.js` re-export specifiers; `src/index.ts` documented as the package/service entry carve-out (the only loose file under `src/`); tests colocated inside the module.
- Gate evidence: `mf-skills verify typescript-file-structure` → `0 issues`.

## Open Questions

- None.

## Handoff

- C010 audits the result.

## Deviations

- The old "src/ is exempt, no index" shape was reversed to match B001 #6 (every package has `src/index.ts`).
