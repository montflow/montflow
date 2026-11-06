# Memory

## Context

Task C001: author the unified entry-point skill `montflow-typescript-project-structure` by repurposing `typescript-conventions`.

## Progress

- 2026-10-07: complete. Renamed `typescript-conventions/` to `montflow-typescript-project-structure/`; rewrote `SKILL.md` (id `19088d58133341e3`, v3.0.0, YAML `groups`/`dependencies`) as the module-law router; added the `3.0.0` CHANGELOG entry.

## Findings

- Repointed the `typescript-conventions` self-name out of `SKILL.md`; only the CHANGELOG history keeps the old name.
- Gate evidence: `bun run --cwd packages/pi-skills cli verify montflow-typescript-project-structure --dir $PWD` → `1 skill · 0 issues`.

## Open Questions

- None.

## Handoff

- Releases C002 and the skill-alignment tasks (C003–C009); C010 gates on them.

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
  `bun run --cwd packages/skills cli verify montflow-typescript-project-structure --dir "$PWD"` returns
  `1 skill · 0 issues`, exit 0. Left unchecked, not ticked.
