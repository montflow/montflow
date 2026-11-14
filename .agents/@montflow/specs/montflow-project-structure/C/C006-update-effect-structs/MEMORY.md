# Memory

## Context

Task C006: align `effect-structs` with the optional-`Blueprint`, `Id` naming, and `.js` decisions.

## Progress

- 2026-10-07: complete. Updated `SKILL.md`, `GATES.md`, and `templates/composed.struct.module.ts`; released `3.1.0`.

## Findings

- `Blueprint` moved out of the required lists and is explicitly optional; `Id` remains the PascalCase struct name; `.js` specifiers; `CONTEXT.md` optional.
- Gate evidence: `mf-skills verify effect-structs` → `0 issues`.

## Open Questions

- None.

## Handoff

- C010 audits the result.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `bun run --cwd packages/pi-skills cli verify <skill> --dir $PWD` reports valid
  — retired: `packages/pi-skills` no longer exists and the skills gained the
  `montflow-` prefix. The replacement
  `bun run --cwd packages/skills cli verify montflow-typescript-structs --dir "$PWD"` returns
  `1 skill · 0 issues`, exit 0. Left unchecked, not ticked.
