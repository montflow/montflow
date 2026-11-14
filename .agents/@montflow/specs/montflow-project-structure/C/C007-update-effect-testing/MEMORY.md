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

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `bun run --cwd packages/pi-skills cli verify <skill> --dir $PWD` reports valid
  — retired: `packages/pi-skills` no longer exists and the skills gained the
  `montflow-` prefix. The replacement
  `bun run --cwd packages/skills cli verify montflow-typescript-testing --dir "$PWD"` returns
  `1 skill · 0 issues`, exit 0. Left unchecked, not ticked.
