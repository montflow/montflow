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

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `bun run --cwd packages/pi-skills cli verify <skill> --dir $PWD` reports valid
  — retired: `packages/pi-skills` no longer exists and the skills gained the
  `montflow-` prefix. The replacement
  `bun run --cwd packages/skills cli verify montflow-typescript-file-structure --dir "$PWD"` returns
  `1 skill · 0 issues`, exit 0. Left unchecked, not ticked.
